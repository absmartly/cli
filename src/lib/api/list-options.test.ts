import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server.js';
import { createAPIClient } from './client.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';

const BASE_URL = TEST_BASE_URL;

describe.skipIf(isLiveMode)('APIClient - List Options', () => {
  const client = createAPIClient(BASE_URL, TEST_API_KEY);

  describe('Date Range Filters', () => {
    it('should send correct date range format for created_at', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        created_after: 1704067200000,
        created_before: 1735603200000,
      });

      expect(receivedParams?.get('created_at')).toBe('1704067200000,1735603200000');
    });

    it('should handle partial date range with created_after only', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        created_after: 1704067200000,
      });

      expect(receivedParams?.get('created_at')).toBe('1704067200000,');
    });

    it('should handle partial date range with created_before only', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        created_before: 1735603200000,
      });

      expect(receivedParams?.get('created_at')).toBe(',1735603200000');
    });

    it('should send correct started_at date range', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        started_after: 1704067200000,
        started_before: 1706745600000,
      });

      expect(receivedParams?.get('started_at')).toBe('1704067200000,1706745600000');
    });

    it('should send correct stopped_at date range', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        stopped_after: 1704067200000,
        stopped_before: 1706745600000,
      });

      expect(receivedParams?.get('stopped_at')).toBe('1704067200000,1706745600000');
    });

    it('should not send date params when neither value is provided', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({});

      expect(receivedParams?.has('created_at')).toBe(false);
      expect(receivedParams?.has('started_at')).toBe(false);
      expect(receivedParams?.has('stopped_at')).toBe(false);
    });
  });

  describe('Alert Flag Conversions', () => {
    it('should convert alert_srm to sample_ratio_mismatch string', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ alert_srm: 1 });

      expect(receivedParams?.get('sample_ratio_mismatch')).toBe('1');
    });

    it('should convert alert_cleanup_needed to string', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ alert_cleanup_needed: 1 });

      expect(receivedParams?.get('cleanup_needed')).toBe('1');
    });

    it('should handle multiple alert flags simultaneously', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        alert_srm: 1,
        alert_cleanup_needed: 1,
        alert_audience_mismatch: 1,
      });

      expect(receivedParams?.get('sample_ratio_mismatch')).toBe('1');
      expect(receivedParams?.get('cleanup_needed')).toBe('1');
      expect(receivedParams?.get('audience_mismatch')).toBe('1');
    });

    it('should convert all 8 alert types correctly', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        alert_srm: 1,
        alert_cleanup_needed: 1,
        alert_audience_mismatch: 1,
        alert_sample_size_reached: 1,
        alert_experiments_interact: 1,
        alert_group_sequential_updated: 1,
        alert_assignment_conflict: 1,
        alert_metric_threshold_reached: 1,
      });

      expect(receivedParams?.get('sample_ratio_mismatch')).toBe('1');
      expect(receivedParams?.get('cleanup_needed')).toBe('1');
      expect(receivedParams?.get('audience_mismatch')).toBe('1');
      expect(receivedParams?.get('sample_size_reached')).toBe('1');
      expect(receivedParams?.get('experiments_interact')).toBe('1');
      expect(receivedParams?.get('group_sequential_updated')).toBe('1');
      expect(receivedParams?.get('assignment_conflict')).toBe('1');
      expect(receivedParams?.get('metric_threshold_reached')).toBe('1');
    });
  });

  describe('Pagination and Filtering', () => {
    it('should send items and page correctly', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ items: 50, page: 3 });

      expect(receivedParams?.get('items')).toBe('50');
      expect(receivedParams?.get('page')).toBe('3');
    });

    it('should send state filter', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ state: 'running' });

      expect(receivedParams?.get('state')).toBe('running');
    });

    it('should send type filter', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ type: 'feature' });

      expect(receivedParams?.get('type')).toBe('feature');
    });

    it('should send comma-separated team IDs', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ teams: '1,2,3' });

      expect(receivedParams?.get('teams')).toBe('1,2,3');
    });

    it('should send comma-separated owner IDs', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ owners: '5,10,15' });

      expect(receivedParams?.get('owners')).toBe('5,10,15');
    });

    it('should send search query', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ search: 'homepage test' });

      expect(receivedParams?.get('search')).toBe('homepage test');
    });

    it('should send analysis_type filter', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ analysis_type: 'group_sequential' });

      expect(receivedParams?.get('analysis_type')).toBe('group_sequential');
    });

    it('should send significance filter', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ significance: 'positive' });

      expect(receivedParams?.get('significance')).toBe('positive');
    });
  });

  describe('Complex Filter Combinations', () => {
    it('should combine multiple filters correctly', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        items: 20,
        page: 3,
        state: 'running',
        type: 'test',
        teams: '1,2',
        created_after: 1704067200000,
        created_before: 1735603200000,
        alert_srm: 1,
        significance: 'positive',
      });

      expect(receivedParams?.get('items')).toBe('20');
      expect(receivedParams?.get('page')).toBe('3');
      expect(receivedParams?.get('state')).toBe('running');
      expect(receivedParams?.get('type')).toBe('test');
      expect(receivedParams?.get('teams')).toBe('1,2');
      expect(receivedParams?.get('created_at')).toBe('1704067200000,1735603200000');
      expect(receivedParams?.get('sample_ratio_mismatch')).toBe('1');
      expect(receivedParams?.get('significance')).toBe('positive');
    });

    it('should omit undefined/null/empty filters', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        items: 10,
        state: undefined,
        type: undefined,
        search: undefined,
      });

      expect(receivedParams?.get('items')).toBe('10');
      expect(receivedParams?.has('state')).toBe(false);
      expect(receivedParams?.has('type')).toBe(false);
      expect(receivedParams?.has('search')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle items of 0 (sent explicitly)', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ items: 0 });

      expect(receivedParams?.get('items')).toBe('0');
    });

    it('should handle page of 0 (sent explicitly)', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ page: 0 });

      expect(receivedParams?.get('page')).toBe('0');
    });

    it('should handle very large items', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({ items: 10000 });

      expect(receivedParams?.get('items')).toBe('10000');
    });

    it('should handle empty string filters as missing', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const url = new URL(request.url);
          receivedParams = url.searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );

      await client.listExperiments({
        state: '',
        type: '',
        search: '',
      });

      expect(receivedParams?.has('state')).toBe(false);
      expect(receivedParams?.has('type')).toBe(false);
      expect(receivedParams?.has('search')).toBe(false);
    });
  });

  describe('Archive/Unarchive Toggle', () => {
    it('should send archive=true by default', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/experiments/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveExperiment(123);

      expect(receivedBody).toEqual({ archive: true });
    });

    it('should send archive=false when unarchive=true', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/experiments/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveExperiment(123, true);

      expect(receivedBody).toEqual({ archive: false });
    });

    it('should archive team correctly', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/teams/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveTeam(10);

      expect(receivedBody).toEqual({ archive: true });
    });

    it('should unarchive team correctly', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/teams/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveTeam(10, true);

      expect(receivedBody).toEqual({ archive: false });
    });

    it('should archive user correctly', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/users/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveUser(5);

      expect(receivedBody).toEqual({ archive: true });
    });

    it('should archive metric correctly', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.put(`${BASE_URL}/metrics/:id/archive`, async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, errors: [] });
        })
      );

      await client.archiveMetric(15);

      expect(receivedBody).toEqual({ archive: true });
    });
  });
});
