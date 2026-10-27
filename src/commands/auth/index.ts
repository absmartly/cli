import { Command } from 'commander';
import chalk from 'chalk';
import { hostname } from 'os';
import { confirm, password as passwordPrompt } from '@inquirer/prompts';
import { setProfile, getProfile, loadConfig } from '../../lib/config/config.js';
import {
  setAPIKey,
  getAPIKey,
  deleteAPIKey,
  setOAuthToken,
  getOAuthToken,
  deleteOAuthToken,
} from '../../lib/config/keyring.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  resolveAPIKey,
  resolveEndpoint,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { fetchAndDisplayImage, supportsInlineImages } from '../../lib/utils/terminal-image.js';
import { summarizeUser } from '../../api-client/user-summary.js';
import { startOAuthFlow } from '../../lib/auth/oauth.js';
import { createAPIClient } from '../../lib/api/client.js';
import { ensureApiVersionPath } from '../../lib/utils/url.js';
import {
  whoami as coreWhoami,
  createAuthApiKey as coreCreateAuthApiKey,
  listAuthApiKeys as coreListAuthApiKeys,
  getAuthApiKey as coreGetAuthApiKey,
  updateAuthApiKey as coreUpdateAuthApiKey,
  deleteAuthApiKey as coreDeleteAuthApiKey,
  editProfile as coreEditProfile,
  resetMyPassword as coreResetMyPassword,
} from '../../core/auth/auth.js';

export const authCommand = new Command('auth').description('Authentication commands');

function buildProfile(
  endpoint: string,
  authMethod: 'api-key' | 'oauth-jwt',
  options: { app?: string; env?: string; insecure?: boolean },
  profileName: string
) {
  let existingExpctldEndpoint = '';
  try {
    const existing = getProfile(profileName);
    if (existing?.expctld?.endpoint) {
      existingExpctldEndpoint = existing.expctld.endpoint;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not found')) {
      console.error(`Warning: unexpected error reading profile "${profileName}": ${msg}`);
    }
    // Profile not found — use empty default
  }

  const profile: {
    api: { endpoint: string; 'auth-method': 'api-key' | 'oauth-jwt'; insecure?: boolean };
    expctld: { endpoint: string };
    application?: string;
    environment?: string;
  } = {
    api: { endpoint, 'auth-method': authMethod },
    expctld: { endpoint: existingExpctldEndpoint },
  };
  if (options.insecure) profile.api.insecure = true;
  if (options.app) profile.application = options.app;
  if (options.env) profile.environment = options.env;
  return profile;
}

const loginCommand = new Command('login')
  .description('Authenticate with ABSmartly and store credentials')
  .argument('[endpoint]', 'API endpoint URL')
  .option('--api-key <key>', 'ABSmartly API key')
  .option('--endpoint <url>', 'API endpoint URL (alternative to positional argument)')
  .option('--app <name>', 'default application name')
  .option('--env <name>', 'default environment name')
  .option('--profile <name>', 'profile name to save credentials under')
  .option('--no-browser', 'do not open browser (print URL instead)')
  .option('--session', 'use session-based JWT tokens (skip API key creation)')
  .option('--persistent', 'create persistent API key (skip prompt)')
  .option('--oauth', 'force OAuth flow even if a valid API key exists')
  .option('-k, --insecure', 'allow insecure TLS connections (self-signed certificates)')
  .action(
    withErrorHandling(async (endpointArg, options, command) => {
      // login creates/deletes API keys remotely and writes credentials; it
      // builds its own clients, so --dry-run cannot be honoured. Refuse.
      if (getGlobalOptions(command).dryRun) {
        throw new Error('auth login does not support --dry-run');
      }
      const parentOpts = command.parent?.parent?.opts() || {};
      const apiKey = options.apiKey || parentOpts.apiKey;
      const rawEndpoint = endpointArg || options.endpoint || parentOpts.endpoint;
      const profileName = options.profile || parentOpts.profile || 'default';

      if (options.session && options.persistent) {
        throw new Error('Cannot use both --session and --persistent');
      }

      if (apiKey) {
        if (!rawEndpoint) {
          throw new Error('--endpoint is required when using --api-key');
        }
        const endpoint = ensureApiVersionPath(rawEndpoint);
        await setAPIKey(apiKey, profileName);
        setProfile(profileName, buildProfile(endpoint, 'api-key', options, profileName));
        console.log(`✓ Logged in successfully (profile: ${profileName})`);
        console.log(`  Endpoint: ${endpoint}`);
        if (options.app) console.log(`  Application: ${options.app}`);
        if (options.env) console.log(`  Environment: ${options.env}`);
        return;
      }

      // Check if we already have a valid API key for this profile
      if (!options.oauth) {
        try {
          let existingEndpoint = rawEndpoint ? ensureApiVersionPath(rawEndpoint) : undefined;
          if (!existingEndpoint) {
            try {
              existingEndpoint = getProfile(profileName).api.endpoint;
            } catch {
              // no profile yet
            }
          }
          const existingKey = await getAPIKey(profileName);
          if (existingKey && existingEndpoint) {
            const client = createAPIClient(existingEndpoint, existingKey, {
              insecure: options.insecure,
            });
            await client.getCurrentUser();
            setProfile(
              profileName,
              buildProfile(existingEndpoint, 'api-key', options, profileName)
            );
            console.log(`✓ Already authenticated (profile: ${profileName})`);
            console.log(`  Endpoint: ${existingEndpoint}`);
            console.log('  Use --oauth to force re-authentication.');
            return;
          }
        } catch {
          // Key missing or invalid — proceed to OAuth
        }
      }

      let resolvedEndpoint = rawEndpoint;
      if (!resolvedEndpoint) {
        try {
          const existingProfile = getProfile(profileName);
          resolvedEndpoint = existingProfile.api.endpoint;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('not found')) {
            console.error(`Warning: unexpected error reading profile "${profileName}": ${msg}`);
          }
        }
      }

      if (!resolvedEndpoint) {
        throw new Error(
          '--endpoint is required for first-time OAuth login.\n' +
            'Run: abs auth login --endpoint https://your-api.example.com/v1'
        );
      }

      resolvedEndpoint = ensureApiVersionPath(resolvedEndpoint);

      console.log(`Authenticating with ${resolvedEndpoint}...`);

      const tokenResponse = await startOAuthFlow(resolvedEndpoint, {
        noBrowser: options.browser === false,
        insecure: options.insecure,
      });

      console.log('✓ Authentication successful!');

      let usePersistentKey: boolean;
      if (options.persistent) {
        usePersistentKey = true;
      } else if (options.session) {
        usePersistentKey = false;
      } else {
        usePersistentKey = await confirm({
          message:
            'Create a persistent API key for this machine? (Recommended — avoids re-authenticating every 24h)',
          default: true,
        });
      }

      if (usePersistentKey) {
        try {
          const tempClient = createAPIClient(
            resolvedEndpoint,
            {
              method: 'oauth-jwt',
              token: tokenResponse.accessToken,
            },
            { insecure: options.insecure }
          );
          const host = hostname().replace(/\.local$/, '');
          const keyName = `cli-${host}`;

          const existingKeys = (await tempClient.listUserApiKeys()) as {
            id: number;
            name: string;
          }[];
          const existing = existingKeys.find((k) => k.name === keyName);
          if (existing) {
            await tempClient.deleteUserApiKey(existing.id);
          }

          const created = (await tempClient.createUserApiKey(keyName)) as { key: string };

          await setAPIKey(created.key, profileName);
          setProfile(profileName, buildProfile(resolvedEndpoint, 'api-key', options, profileName));
          console.log(`✓ Persistent API key created and stored (profile: ${profileName})`);
        } catch (error) {
          console.error(
            `\nFailed to create persistent API key: ${error instanceof Error ? error.message : error}`
          );
          console.error('Your session token has been stored instead (expires in 24h).');
          console.error(
            'To create a persistent API key manually, run: abs auth create-api-key --name <name>'
          );
          await setOAuthToken(tokenResponse.accessToken, profileName);
          setProfile(
            profileName,
            buildProfile(resolvedEndpoint, 'oauth-jwt', options, profileName)
          );
        }
      } else {
        await setOAuthToken(tokenResponse.accessToken, profileName);
        setProfile(profileName, buildProfile(resolvedEndpoint, 'oauth-jwt', options, profileName));
        console.log(`✓ Session token stored (profile: ${profileName})`);
        console.log('  Note: Token expires in 24h. Re-run `abs auth login` to refresh.');
      }

      console.log(`  Endpoint: ${resolvedEndpoint}`);
      if (options.app) console.log(`  Application: ${options.app}`);
      if (options.env) console.log(`  Environment: ${options.env}`);
    })
  );

const statusCommand = new Command('status')
  .description('Show current authentication status')
  .option('--show-full-key', 'show full API key (use with caution)')
  .action(
    withErrorHandling(async (options, command) => {
      const config = loadConfig();
      const parentOpts = command.parent?.parent?.opts() || {};
      const profileName = parentOpts.profile || config['default-profile'];

      try {
        const profile = getProfile(profileName);
        const authMethod = profile.api['auth-method'] ?? 'api-key';

        console.log(`Profile: ${profileName}`);
        console.log(`Endpoint: ${profile.api.endpoint}`);
        console.log(`Auth Method: ${authMethod}`);

        if (authMethod === 'oauth-jwt') {
          const token = await getOAuthToken(profileName);
          if (token) {
            const tokenDisplay = options.showFullKey ? token : `****...${token.slice(-8)}`;
            console.log(`OAuth Token: ${tokenDisplay}`);

            try {
              const [, payload] = token.split('.');
              if (payload) {
                const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
                if (decoded.exp) {
                  const expiresAt = new Date(decoded.exp * 1000);
                  const now = new Date();
                  if (expiresAt > now) {
                    console.log(`Expires: ${expiresAt.toLocaleString()}`);
                  } else {
                    console.log(chalk.yellow(`Token expired: ${expiresAt.toLocaleString()}`));
                    console.log(chalk.yellow('Run `abs auth login` to re-authenticate.'));
                  }
                }
              }
            } catch {
              // not a parseable JWT, skip expiry display
            }
          } else {
            console.log('OAuth Token: not set');
          }
        } else {
          const apiKey = await getAPIKey(profileName);
          const keyDisplay = apiKey
            ? options.showFullKey
              ? apiKey
              : `****...${apiKey.slice(-4)}`
            : 'not set';
          console.log(`API Key: ${keyDisplay}`);
        }

        if (profile.application) console.log(`Application: ${profile.application}`);
        if (profile.environment) console.log(`Environment: ${profile.environment}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('not found') || msg.includes('No API key')) {
          throw new Error('Not authenticated. Run `abs auth login` to authenticate.');
        }
        throw new Error(`Error checking auth status: ${msg || error}`);
      }
    })
  );

const logoutCommand = new Command('logout').description('Clear stored credentials').action(
  withErrorHandling(async (_options, command) => {
    const config = loadConfig();
    const parentOpts = command.parent?.parent?.opts() || {};
    const profileName = parentOpts.profile || config['default-profile'];

    const [oauthResult, apiKeyResult] = await Promise.allSettled([
      deleteOAuthToken(profileName),
      deleteAPIKey(profileName),
    ]);

    const warnings: string[] = [];
    if (oauthResult.status === 'rejected') {
      warnings.push(
        `Warning: failed to delete OAuth token: ${oauthResult.reason instanceof Error ? oauthResult.reason.message : oauthResult.reason}`
      );
    }
    if (apiKeyResult.status === 'rejected') {
      warnings.push(
        `Warning: failed to delete API key: ${apiKeyResult.reason instanceof Error ? apiKeyResult.reason.message : apiKeyResult.reason}`
      );
    }
    for (const w of warnings) {
      console.error(w);
    }

    if (warnings.length === 2) {
      console.error(`Logout may be incomplete for profile: ${profileName}`);
    } else {
      console.log(`✓ Logged out (profile: ${profileName})`);
    }
  })
);

const createApiKeyCommand = new Command('create-api-key')
  .description('Create a personal API key for the current user')
  .requiredOption('--name <name>', 'API key name')
  .option('--description <text>', 'API key description')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createApiKeyCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const result = await coreCreateAuthApiKey(client, {
        name: options.name,
        description: options.description,
      });
      console.log(chalk.green(`✓ API key created: ${result.data.name}`));
      console.log(`  Key: ${result.data.key}`);
      console.log(chalk.yellow('  Save this key now — it cannot be retrieved later.'));
    })
  );

const whoamiCommand = new Command('whoami')
  .description('Show the currently authenticated user')
  .option(
    '--avatar [cols]',
    'display avatar inline, optional width in columns (default: 20)',
    parseInt
  )
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(whoamiCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const endpoint = resolveEndpoint(globalOptions);

      const result = await coreWhoami(client);
      const user = result.data as any;
      const summary = summarizeUser(user, endpoint);

      console.log(`ID: ${summary.id}`);
      console.log(`Email: ${summary.email}`);
      if (summary.name) console.log(`Name: ${summary.name}`);
      if (summary.department) console.log(`Department: ${summary.department}`);
      if (summary.job_title) console.log(`Job Title: ${summary.job_title}`);
      if (summary.last_login_at) console.log(`Last Login: ${summary.last_login_at}`);
      if (summary.avatar_url) {
        console.log(`Avatar: ${summary.avatar_url}`);

        if (options.avatar && supportsInlineImages()) {
          const apiKey = await resolveAPIKey(globalOptions);
          await fetchAndDisplayImage(summary.avatar_url, user.avatar?.file_name ?? 'avatar', {
            headers: { Authorization: `Api-Key ${apiKey}` },
            width: typeof options.avatar === 'number' ? options.avatar : 20,
          });
        }
      }
    })
  );

const listApiKeysCommand = new Command('list-api-keys')
  .description('List personal API keys for the current user')
  .action(
    withErrorHandling(async () => {
      const globalOptions = getGlobalOptions(listApiKeysCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreListAuthApiKeys(client);
      printFormatted(result.data, globalOptions);
    })
  );

const getApiKeyCommand = new Command('get-api-key')
  .description('Get a personal API key by ID')
  .argument('<id>', 'API key ID', parseInt)
  .action(
    withErrorHandling(async (id: number) => {
      const globalOptions = getGlobalOptions(getApiKeyCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreGetAuthApiKey(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const updateApiKeyCommand = new Command('update-api-key')
  .description('Update a personal API key')
  .argument('<id>', 'API key ID', parseInt)
  .option('--name <name>', 'API key name')
  .option('--description <text>', 'API key description')
  .action(
    withErrorHandling(async (id: number, options) => {
      const globalOptions = getGlobalOptions(updateApiKeyCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreUpdateAuthApiKey(client, {
        id,
        name: options.name,
        description: options.description,
      });
      console.log(chalk.green(`✓ API key ${id} updated`));
    })
  );

const deleteApiKeyCommand = new Command('delete-api-key')
  .description('Delete a personal API key')
  .argument('<id>', 'API key ID', parseInt)
  .action(
    withErrorHandling(async (id: number) => {
      const globalOptions = getGlobalOptions(deleteApiKeyCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreDeleteAuthApiKey(client, { id });
      console.log(chalk.green(`✓ API key ${id} deleted`));
    })
  );

const editProfileCommand = new Command('edit-profile')
  .description('Edit current user profile')
  .option('--first-name <name>', 'first name')
  .option('--last-name <name>', 'last name')
  .option('--department <dept>', 'department')
  .option('--job-title <title>', 'job title')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(editProfileCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreEditProfile(client, {
        firstName: options.firstName,
        lastName: options.lastName,
        department: options.department,
        jobTitle: options.jobTitle,
      });
      console.log(chalk.green(`✓ Profile updated`));
      const user = result.data;
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
      if (name) console.log(`  Name: ${name}`);
      if (user.department) console.log(`  Department: ${user.department}`);
      if (user.job_title) console.log(`  Job Title: ${user.job_title}`);
    })
  );

const resetMyPasswordCommand = new Command('reset-my-password')
  .description('Change password for the currently authenticated user')
  .action(
    withErrorHandling(async () => {
      const globalOptions = getGlobalOptions(resetMyPasswordCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const oldPassword = await passwordPrompt({ message: 'Current password:' });
      const newPassword = await passwordPrompt({ message: 'New password:' });
      const confirmPassword = await passwordPrompt({ message: 'Confirm new password:' });

      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      await coreResetMyPassword(client, {
        oldPassword,
        newPassword,
      });

      console.log(chalk.green('✓ Password changed successfully.'));
    })
  );

authCommand.addCommand(loginCommand);
authCommand.addCommand(statusCommand);
authCommand.addCommand(logoutCommand);
authCommand.addCommand(createApiKeyCommand);
authCommand.addCommand(whoamiCommand);
authCommand.addCommand(listApiKeysCommand);
authCommand.addCommand(getApiKeyCommand);
authCommand.addCommand(updateApiKeyCommand);
authCommand.addCommand(deleteApiKeyCommand);
authCommand.addCommand(editProfileCommand);
authCommand.addCommand(resetMyPasswordCommand);
