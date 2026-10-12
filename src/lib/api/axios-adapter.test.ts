import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AxiosHttpClient } from './axios-adapter.js';

const BASE_URL = 'https://show-request-test.absmartly.com/v1';

const mswServer = setupServer();

function captureStderr(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      calls.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
  return { calls, restore: () => spy.mockRestore() };
}

describe('AxiosHttpClient request/response logging', () => {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
  afterAll(() => mswServer.close());
  afterEach(() => mswServer.resetHandlers());

  describe('showRequest', () => {
    it('writes a formatted HTTP request block to stderr', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/experiments`, () => HttpResponse.json({ id: 1 }, { status: 201 }))
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'secret-key', { showRequest: true });
        await client.request({
          method: 'POST',
          url: '/experiments',
          data: { name: 'my-exp' },
        });

        const out = stderr.calls.join('');
        expect(out).toContain('→ POST');
        expect(out).toContain(`${BASE_URL}/experiments`);
        expect(out).toContain('"name": "my-exp"');
      } finally {
        stderr.restore();
      }
    });

    it('redacts Authorization by default', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'super-secret-token-xyz', {
          showRequest: true,
        });
        await client.request({ method: 'GET', url: '/ping' });

        const out = stderr.calls.join('');
        expect(out).toContain('Authorization: Api-Key ***');
        expect(out).not.toContain('super-secret-token-xyz');
      } finally {
        stderr.restore();
      }
    });

    it('reveals Authorization when showSecrets is true', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'super-secret-token-xyz', {
          showRequest: true,
          showSecrets: true,
        });
        await client.request({ method: 'GET', url: '/ping' });

        const out = stderr.calls.join('');
        expect(out).toContain('Authorization: Api-Key super-secret-token-xyz');
      } finally {
        stderr.restore();
      }
    });
  });

  describe('curl', () => {
    it('writes a curl command to stderr', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/experiments`, () => HttpResponse.json({ id: 1 }, { status: 201 }))
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { curl: true });
        await client.request({
          method: 'POST',
          url: '/experiments',
          data: { name: 'x' },
        });

        const out = stderr.calls.join('');
        expect(out).toContain('$ curl -X POST');
        expect(out).toContain(`'${BASE_URL}/experiments'`);
        expect(out).toContain(`-d '{"name":"x"}'`);
      } finally {
        stderr.restore();
      }
    });

    it('emits both formats when showRequest and curl are both set', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/experiments`, () => HttpResponse.json({ id: 1 }, { status: 201 }))
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', {
          showRequest: true,
          curl: true,
        });
        await client.request({
          method: 'POST',
          url: '/experiments',
          data: { name: 'x' },
        });

        const out = stderr.calls.join('');
        expect(out).toContain('→ POST');
        expect(out).toContain('$ curl -X POST');
      } finally {
        stderr.restore();
      }
    });
  });

  describe('showResponse', () => {
    it('writes a successful response to stderr', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/exp/42`, () =>
          HttpResponse.json({ id: 42, name: 'foo' }, { status: 200 })
        )
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { showResponse: true });
        await client.request({ method: 'GET', url: '/exp/42' });

        const out = stderr.calls.join('');
        expect(out).toContain('← 200');
        expect(out).toContain('"id": 42');
      } finally {
        stderr.restore();
      }
    });

    it('writes an error response to stderr (4xx) and still throws', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/missing`, () =>
          HttpResponse.json({ error: 'not found' }, { status: 404 })
        )
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { showResponse: true });
        await expect(client.request({ method: 'GET', url: '/missing' })).rejects.toThrow();

        const out = stderr.calls.join('');
        expect(out).toContain('← 404');
        expect(out).toContain('not found');
      } finally {
        stderr.restore();
      }
    });
  });

  describe('dryRun', () => {
    it('rejects a mutating PUT with DryRunError and never hits the network', async () => {
      let networkHit = false;
      mswServer.use(
        http.put(`${BASE_URL}/experiments/1/stop`, () => {
          networkHit = true;
          return HttpResponse.json({ ok: true, experiment: { id: 1 } });
        })
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });

      await expect(
        client.request({ method: 'PUT', url: '/experiments/1/stop', data: { reason: 'testing' } })
      ).rejects.toMatchObject({ name: 'DryRunError', method: 'PUT', url: '/experiments/1/stop' });
      expect(networkHit).toBe(false);
    });

    it('rejects a mutating POST with DryRunError', async () => {
      let networkHit = false;
      mswServer.use(
        http.post(`${BASE_URL}/experiments`, () => {
          networkHit = true;
          return HttpResponse.json({ id: 1 }, { status: 201 });
        })
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });

      await expect(
        client.request({ method: 'POST', url: '/experiments', data: { name: 'x' } })
      ).rejects.toMatchObject({ name: 'DryRunError', method: 'POST', url: '/experiments' });
      expect(networkHit).toBe(false);
    });

    it('does not block GET requests', async () => {
      mswServer.use(http.get(`${BASE_URL}/experiments/1`, () => HttpResponse.json({ id: 1 })));

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
      const response = await client.request({ method: 'GET', url: '/experiments/1' });

      expect(response.status).toBe(200);
    });

    it('does not block allowlisted read-only POST endpoints (e.g. datasource test)', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/datasources/test`, () => HttpResponse.json({ ok: true, errors: [] }))
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
      const response = await client.request({
        method: 'POST',
        url: '/datasources/test',
        data: { type: 'postgres' },
      });

      expect(response.status).toBe(200);
    });

    it('does not block POST /datasources/:id/json_layouts/preview (suffix match)', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/datasources/123/json_layouts/preview`, () =>
          HttpResponse.json({ ok: true })
        )
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
      const response = await client.request({
        method: 'POST',
        url: '/datasources/123/json_layouts/preview',
        data: {},
      });

      expect(response.status).toBe(200);
    });

    it('does not block POST /storage_configs/test (read-only connection test)', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/storage_configs/test`, () => HttpResponse.json({ ok: true }))
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
      const response = await client.request({
        method: 'POST',
        url: '/storage_configs/test',
        data: {},
      });

      expect(response.status).toBe(200);
    });

    it('still blocks DELETE to an allowlisted POST path (path reuse is method-specific)', async () => {
      let networkHit = false;
      mswServer.use(
        http.delete(`${BASE_URL}/events/unit_data`, () => {
          networkHit = true;
          return HttpResponse.json({ ok: true });
        })
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });

      await expect(
        client.request({ method: 'DELETE', url: '/events/unit_data', data: { units: [] } })
      ).rejects.toMatchObject({ name: 'DryRunError' });
      expect(networkHit).toBe(false);
    });

    it.each([
      '/experiments?x=/events',
      '/experiments/1/foo/events',
      '/datasources/123/json_layouts/create',
      '/experiments#/events',
    ])('blocks POST %s (allowlist is anchored on the pathname)', async (url) => {
      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
      await expect(client.request({ method: 'POST', url, data: {} })).rejects.toMatchObject({
        name: 'DryRunError',
        method: 'POST',
        url,
      });
    });

    it.each(['/events?take=10', '/statistics/power/plan/matrix', '/events/history'])(
      'allows POST %s',
      async (url) => {
        const path = url.split('?')[0];
        mswServer.use(http.post(`${BASE_URL}${path}`, () => HttpResponse.json({ ok: true })));
        const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });
        const response = await client.request({ method: 'POST', url, data: {} });
        expect(response.status).toBe(200);
      }
    );

    it('still logs the request via --show-request before rejecting', async () => {
      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'secret-key', {
          dryRun: true,
          showRequest: true,
        });

        await expect(
          client.request({ method: 'PUT', url: '/experiments/1/stop', data: { reason: 'x' } })
        ).rejects.toMatchObject({ name: 'DryRunError' });

        const out = stderr.calls.join('');
        expect(out).toContain('→ PUT');
        expect(out).toContain(`${BASE_URL}/experiments/1/stop`);
      } finally {
        stderr.restore();
      }
    });

    it('does not print a "non-HTTP error" line under --show-response', async () => {
      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'secret-key', {
          dryRun: true,
          showResponse: true,
        });

        await expect(
          client.request({ method: 'PUT', url: '/experiments/1/stop', data: { reason: 'x' } })
        ).rejects.toMatchObject({ name: 'DryRunError' });

        expect(stderr.calls.join('')).not.toContain('non-HTTP error');
      } finally {
        stderr.restore();
      }
    });

    it('does not trigger axios-retry (no retry attempts, error surfaces immediately)', async () => {
      let attempts = 0;
      mswServer.use(
        http.put(`${BASE_URL}/experiments/1/stop`, () => {
          attempts++;
          return HttpResponse.json({ ok: true });
        })
      );

      const client = new AxiosHttpClient(BASE_URL, 'secret-key', { dryRun: true });

      await expect(
        client.request({ method: 'PUT', url: '/experiments/1/stop', data: {} })
      ).rejects.toMatchObject({ name: 'DryRunError' });
      expect(attempts).toBe(0);
    });
  });

  describe('retries', () => {
    it('fires the request logger on every retry attempt', async () => {
      let calls = 0;
      mswServer.use(
        http.get(`${BASE_URL}/flaky`, () => {
          calls++;
          if (calls < 3) {
            return HttpResponse.json({ error: 'oops' }, { status: 500 });
          }
          return HttpResponse.json({ ok: true });
        })
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', {
          showRequest: true,
          showResponse: true,
        });
        await client.request({ method: 'GET', url: '/flaky' });

        const out = stderr.calls.join('');
        const requestArrows = (out.match(/→ GET/g) ?? []).length;
        const responseArrows = (out.match(/← /g) ?? []).length;
        expect(requestArrows).toBe(3);
        expect(responseArrows).toBe(3);
      } finally {
        stderr.restore();
      }
    }, 30000);
  });

  describe('no flags', () => {
    it('writes nothing to stderr when no logging flags are set', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok');
        await client.request({ method: 'GET', url: '/ping' });

        const out = stderr.calls.join('');
        expect(out).toBe('');
      } finally {
        stderr.restore();
      }
    });
  });

  describe('TTY and noColor', () => {
    async function withStderrTTY<T>(value: boolean | undefined, fn: () => Promise<T>): Promise<T> {
      const original = process.stderr.isTTY;
      Object.defineProperty(process.stderr, 'isTTY', { value, configurable: true });
      try {
        return await fn();
      } finally {
        Object.defineProperty(process.stderr, 'isTTY', { value: original, configurable: true });
      }
    }

    it('emits ANSI codes when stderr is a TTY and noColor is false', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      await withStderrTTY(true, async () => {
        const stderr = captureStderr();
        try {
          const client = new AxiosHttpClient(BASE_URL, 'tok', { showRequest: true });
          await client.request({ method: 'GET', url: '/ping' });
          expect(stderr.calls.join('')).toMatch(/\x1b\[/);
        } finally {
          stderr.restore();
        }
      });
    });

    it('emits no ANSI when noColor is true even on a TTY', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      await withStderrTTY(true, async () => {
        const stderr = captureStderr();
        try {
          const client = new AxiosHttpClient(BASE_URL, 'tok', {
            showRequest: true,
            noColor: true,
          });
          await client.request({ method: 'GET', url: '/ping' });
          expect(stderr.calls.join('')).not.toMatch(/\x1b\[/);
        } finally {
          stderr.restore();
        }
      });
    });

    it('emits no ANSI when stderr is not a TTY', async () => {
      mswServer.use(http.get(`${BASE_URL}/ping`, () => HttpResponse.json({ ok: true })));

      await withStderrTTY(false, async () => {
        const stderr = captureStderr();
        try {
          const client = new AxiosHttpClient(BASE_URL, 'tok', { showRequest: true });
          await client.request({ method: 'GET', url: '/ping' });
          expect(stderr.calls.join('')).not.toMatch(/\x1b\[/);
        } finally {
          stderr.restore();
        }
      });
    });
  });

  describe('suppression of identical consecutive requests', () => {
    it('emits the request once for back-to-back identical polls and reports the suppressed count', async () => {
      mswServer.use(http.get(`${BASE_URL}/poll`, () => HttpResponse.json({ status: 'running' })));

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', {
          showRequest: true,
          showResponse: true,
        });
        await client.request({ method: 'GET', url: '/poll' });
        await client.request({ method: 'GET', url: '/poll' });
        await client.request({ method: 'GET', url: '/poll' });
        // Different URL flushes the suppression count.
        mswServer.use(http.get(`${BASE_URL}/done`, () => HttpResponse.json({ ok: true })));
        await client.request({ method: 'GET', url: '/done' });

        const out = stderr.calls.join('');
        const pollRequests = (out.match(/→ GET .*\/poll/g) ?? []).length;
        const doneRequests = (out.match(/→ GET .*\/done/g) ?? []).length;
        // Responses also dedup with their request — only the first
        // /poll response and the /done response are emitted.
        const responses = (out.match(/← 200/g) ?? []).length;
        expect(pollRequests).toBe(1);
        expect(doneRequests).toBe(1);
        expect(responses).toBe(2);
        expect(out).toContain('(2 identical requests suppressed)');
      } finally {
        stderr.restore();
      }
    });

    it('also suppresses responses when only --show-response is on', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/poll`, () => HttpResponse.json({ status: 'running' })),
        http.get(`${BASE_URL}/done`, () => HttpResponse.json({ ok: true }))
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { showResponse: true });
        await client.request({ method: 'GET', url: '/poll' });
        await client.request({ method: 'GET', url: '/poll' });
        await client.request({ method: 'GET', url: '/poll' });
        await client.request({ method: 'GET', url: '/done' });

        const out = stderr.calls.join('');
        // First /poll response + /done response. The two repeat polls
        // collapse into a "(2 identical requests suppressed)" line.
        expect((out.match(/← 200/g) ?? []).length).toBe(2);
        expect(out).toContain('(2 identical requests suppressed)');
        expect(out).not.toContain('→');
      } finally {
        stderr.restore();
      }
    });

    it('does not suppress when params or body differ', async () => {
      mswServer.use(http.get(`${BASE_URL}/items`, () => HttpResponse.json({ ok: true })));

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { showRequest: true });
        await client.request({ method: 'GET', url: '/items', params: { page: 1 } });
        await client.request({ method: 'GET', url: '/items', params: { page: 2 } });

        const out = stderr.calls.join('');
        const requests = (out.match(/→ GET .*\/items/g) ?? []).length;
        expect(requests).toBe(2);
        expect(out).not.toContain('suppressed');
      } finally {
        stderr.restore();
      }
    });

    it('suppresses alternating polling patterns (A, B, A, B, ...)', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/cfg/1`, () => HttpResponse.json({ status: 'running' })),
        http.get(`${BASE_URL}/cfg/1/history`, () => HttpResponse.json({ items: [] })),
        http.get(`${BASE_URL}/done`, () => HttpResponse.json({ ok: true }))
      );

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(BASE_URL, 'tok', { showRequest: true });
        // First poll cycle — both new, both printed.
        await client.request({ method: 'GET', url: '/cfg/1' });
        await client.request({ method: 'GET', url: '/cfg/1/history' });
        // Three more cycles — every request should be suppressed.
        for (let i = 0; i < 3; i++) {
          await client.request({ method: 'GET', url: '/cfg/1' });
          await client.request({ method: 'GET', url: '/cfg/1/history' });
        }
        // Polling ends; new request flushes the suppressed count.
        await client.request({ method: 'GET', url: '/done' });

        const out = stderr.calls.join('');
        expect((out.match(/→ GET .*\/cfg\/1$/gm) ?? []).length).toBe(1);
        expect((out.match(/→ GET .*\/cfg\/1\/history/g) ?? []).length).toBe(1);
        expect((out.match(/→ GET .*\/done/g) ?? []).length).toBe(1);
        expect(out).toContain('(6 identical requests suppressed)');
      } finally {
        stderr.restore();
      }
    });
  });

  describe('oauth-jwt + showResponse', () => {
    it('logs both the original 401 and the retry response after token refresh', async () => {
      let callCount = 0;
      mswServer.use(
        http.get(`${BASE_URL}/protected`, ({ request }) => {
          callCount++;
          const auth = request.headers.get('Authorization');
          if (auth === 'Bearer expired-token') {
            return HttpResponse.json({ error: 'unauthorized' }, { status: 401 });
          }
          if (auth === 'Bearer fresh-token') {
            return HttpResponse.json({ ok: true });
          }
          return HttpResponse.json({ error: 'unexpected' }, { status: 400 });
        })
      );

      const onExpired = vi.fn().mockResolvedValue({ method: 'oauth-jwt', token: 'fresh-token' });

      const stderr = captureStderr();
      try {
        const client = new AxiosHttpClient(
          BASE_URL,
          { method: 'oauth-jwt', token: 'expired-token', onExpired },
          { showResponse: true }
        );
        const response = await client.request({ method: 'GET', url: '/protected' });
        expect(response.status).toBe(200);
        expect(callCount).toBe(2);

        const out = stderr.calls.join('');
        const arrows = out.match(/← \d+/g) ?? [];
        expect(arrows.length).toBe(2);
        expect(out).toMatch(/← 401/);
        expect(out).toMatch(/← 200/);
      } finally {
        stderr.restore();
      }
    });
  });
});
