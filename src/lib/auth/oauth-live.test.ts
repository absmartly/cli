import { describe, it, expect, afterAll } from 'vitest';
import axios from 'axios';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';
import { createAPIClient } from '../api/client.js';
import { generatePKCE } from './pkce.js';
import { exchangeCodeForToken } from './token-exchange.js';
import { stripApiVersionPath } from '../utils/url.js';

const LIVE_USERNAME = process.env.LIVE_USERNAME;
const LIVE_PASSWORD = process.env.LIVE_PASSWORD;

async function performOAuthBrowserFlow(
  endpoint: string
): Promise<{ code: string; codeVerifier: string; redirectUri: string }> {
  const { chromium } = await import('playwright');
  const { codeVerifier, codeChallenge } = generatePKCE();
  const redirectUri = 'http://localhost:8787/oauth/callback';

  const baseUrl = stripApiVersionPath(endpoint);
  const authUrl = new URL(`${baseUrl}/auth/oauth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', 'mcp-absmartly-universal');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', 'mcp:access');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  let capturedCode: string | undefined;

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OAuth flow timed out')), 30000);

    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('http://localhost')) {
        clearTimeout(timeout);
        try {
          const parsed = new URL(url);
          const code = parsed.searchParams.get('code');
          if (code) resolve(code);
          else reject(new Error('No code in callback URL'));
        } catch (e) {
          reject(e);
        }
      }
    });
  });

  try {
    await page.goto(authUrl.toString(), { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', LIVE_USERNAME!);
    await page.fill('input[type="password"]', LIVE_PASSWORD!);
    await page.click('button[type="submit"]');

    // Newer servers ask the user to approve the client after login. Older
    // ones redirect straight to the callback, which settles codePromise first.
    const approve = page.getByRole('button', { name: 'Approve' });
    await Promise.race([
      approve.click({ timeout: 15000 }).catch(() => {}),
      codePromise.catch(() => {}),
    ]);

    capturedCode = await codePromise;

    if (!capturedCode) {
      throw new Error('No authorization code received');
    }

    return { code: capturedCode, codeVerifier, redirectUri };
  } finally {
    await browser.close();
  }
}

describe.runIf(isLiveMode)('OAuth live API tests', () => {
  const client = createAPIClient(TEST_BASE_URL, TEST_API_KEY);

  describe('OAuth discovery endpoint', () => {
    it('returns OAuth authorization server metadata', async () => {
      const baseUrl = stripApiVersionPath(TEST_BASE_URL);
      const response = await axios.get(
        `${baseUrl}/auth/oauth/.well-known/oauth-authorization-server`,
        { httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false }) }
      );

      expect(response.status).toBe(200);
      expect(response.data.issuer).toBeDefined();
      expect(response.data.authorization_endpoint).toContain('/auth/oauth/authorize');
      expect(response.data.token_endpoint).toContain('/auth/oauth/token');
      expect(response.data.scopes_supported).toContain('mcp:access');
      expect(response.data.grant_types_supported).toContain('authorization_code');
      expect(response.data.code_challenge_methods_supported).toContain('S256');
      expect(response.data.response_types_supported).toContain('code');
    });
  });

  describe('Current user endpoint', () => {
    it('fetches current user with API key auth', async () => {
      const user = await client.getCurrentUser();
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(typeof user.id).toBe('number');
    });
  });

  describe('API key CRUD lifecycle', () => {
    let createdKeyId: number | undefined;

    afterAll(async () => {
      if (createdKeyId) {
        try {
          await client.deleteUserApiKey(createdKeyId);
        } catch {}
      }
    });

    it('creates, retrieves, lists, and deletes a personal API key', async () => {
      const keyName = `cli-vitest-${Date.now()}`;
      const created = (await client.createUserApiKey(keyName)) as {
        id: number;
        name: string;
        key: string;
      };
      createdKeyId = created.id;

      expect(created.id).toBeDefined();
      expect(created.name).toBe(keyName);
      expect(created.key).toBeDefined();
      expect(typeof created.key).toBe('string');

      const fetched = (await client.getUserApiKey(created.id)) as { id: number; name: string };
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe(keyName);

      const keys = (await client.listUserApiKeys()) as { id: number }[];
      expect(keys.some((k) => k.id === created.id)).toBe(true);

      await client.deleteUserApiKey(created.id);
      createdKeyId = undefined;

      try {
        await client.getUserApiKey(created.id);
        expect.fail('Should have thrown 404');
      } catch (error) {
        expect((error as any).statusCode || (error as any).status).toBe(404);
      }
    });
  });

  describe.runIf(LIVE_USERNAME && LIVE_PASSWORD)('OAuth browser flow', () => {
    it('completes full OAuth flow and gets a valid JWT', async () => {
      const { code, codeVerifier, redirectUri } = await performOAuthBrowserFlow(TEST_BASE_URL);

      const tokenResponse = await exchangeCodeForToken({
        endpoint: TEST_BASE_URL,
        code,
        codeVerifier,
        redirectUri,
        clientId: 'mcp-absmartly-universal',
      });

      expect(tokenResponse.accessToken).toBeDefined();
      expect(tokenResponse.tokenType).toBe('Bearer');
      expect(tokenResponse.expiresIn).toBeGreaterThan(0);

      const jwtClient = createAPIClient(TEST_BASE_URL, {
        method: 'oauth-jwt',
        token: tokenResponse.accessToken,
      });
      const user = await jwtClient.getCurrentUser();
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
    }, 60000);

    it('creates persistent API key after OAuth flow', async () => {
      const { code, codeVerifier, redirectUri } = await performOAuthBrowserFlow(TEST_BASE_URL);

      const tokenResponse = await exchangeCodeForToken({
        endpoint: TEST_BASE_URL,
        code,
        codeVerifier,
        redirectUri,
        clientId: 'mcp-absmartly-universal',
      });

      const jwtClient = createAPIClient(TEST_BASE_URL, {
        method: 'oauth-jwt',
        token: tokenResponse.accessToken,
      });

      const keyName = `cli-vitest-persistent-${Date.now()}`;
      const created = (await jwtClient.createUserApiKey(keyName)) as { id: number; key: string };

      try {
        expect(created.key).toBeDefined();

        const apiKeyClient = createAPIClient(TEST_BASE_URL, created.key);
        const user = await apiKeyClient.getCurrentUser();
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
      } finally {
        try {
          await client.deleteUserApiKey(created.id);
        } catch {}
      }
    }, 60000);
  });
});
