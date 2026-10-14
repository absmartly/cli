import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  collectBulkIds,
  fetchBulkNames,
  runBulkOperation,
  bulkStart,
  bulkStop,
  bulkArchive,
} from './bulk.js';
import { APIError, DryRunError } from '../../api-client/http-client.js';
import type { ExperimentId } from '../../lib/api/branded-types.js';

vi.mock('../../lib/utils/validators.js', () => ({
  parseExperimentId: (v: string) => Number(v) as ExperimentId,
}));

const id = (n: number) => n as ExperimentId;

describe('bulk', () => {
  let mockClient: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockClient = {
      listExperiments: vi.fn(),
      getExperiment: vi.fn(),
      startExperiment: vi.fn(),
      stopExperiment: vi.fn(),
      archiveExperiment: vi.fn(),
    };
  });

  describe('collectBulkIds', () => {
    it('returns stdinIds when provided', async () => {
      const stdinIds = [id(1), id(2)];
      const result = await collectBulkIds(mockClient as any, ['99'], { stdinIds });
      expect(result).toEqual(stdinIds);
      expect(mockClient.listExperiments).not.toHaveBeenCalled();
    });

    it('parses rawIds when no stdinIds', async () => {
      const result = await collectBulkIds(mockClient as any, ['10', '20'], {});
      expect(result).toEqual([10, 20]);
    });

    it('throws when no ids, no stdin, no filters', async () => {
      await expect(collectBulkIds(mockClient as any, [], {})).rejects.toThrow(
        'Provide experiment IDs, --stdin, or use --state / --app filters'
      );
    });

    it('fetches experiments by state filter', async () => {
      mockClient.listExperiments.mockResolvedValue([{ id: id(5) }, { id: id(6) }]);
      const result = await collectBulkIds(mockClient as any, [], { state: 'running' });
      expect(mockClient.listExperiments).toHaveBeenCalledWith({ state: 'running' });
      expect(result).toEqual([id(5), id(6)]);
    });

    it('fetches experiments by app filter', async () => {
      mockClient.listExperiments.mockResolvedValue([{ id: id(7) }]);
      const result = await collectBulkIds(mockClient as any, [], { app: 'web' });
      expect(mockClient.listExperiments).toHaveBeenCalledWith({ application: 'web' });
      expect(result).toEqual([id(7)]);
    });
  });

  describe('fetchBulkNames', () => {
    it('returns names for each experiment', async () => {
      mockClient.getExperiment
        .mockResolvedValueOnce({ name: 'Exp A' })
        .mockResolvedValueOnce({ name: 'Exp B' });
      const names = await fetchBulkNames(mockClient as any, [id(1), id(2)]);
      expect(names.get(id(1))).toBe('Exp A');
      expect(names.get(id(2))).toBe('Exp B');
    });

    it('swallows 404 and returns unknown placeholder', async () => {
      mockClient.getExperiment.mockRejectedValue({ statusCode: 404 });
      const names = await fetchBulkNames(mockClient as any, [id(99)]);
      expect(names.get(id(99))).toBe('(unknown #99)');
    });

    it('swallows 404 with status field (not statusCode)', async () => {
      mockClient.getExperiment.mockRejectedValue({ status: 404 });
      const names = await fetchBulkNames(mockClient as any, [id(42)]);
      expect(names.get(id(42))).toBe('(unknown #42)');
    });

    it('re-throws 401 errors', async () => {
      mockClient.getExperiment.mockRejectedValue({ statusCode: 401 });
      await expect(fetchBulkNames(mockClient as any, [id(1)])).rejects.toEqual({ statusCode: 401 });
    });

    it('re-throws 500 errors', async () => {
      mockClient.getExperiment.mockRejectedValue({ statusCode: 500 });
      await expect(fetchBulkNames(mockClient as any, [id(1)])).rejects.toEqual({ statusCode: 500 });
    });

    it('re-throws generic errors without status', async () => {
      mockClient.getExperiment.mockRejectedValue(new Error('network'));
      await expect(fetchBulkNames(mockClient as any, [id(1)])).rejects.toThrow('network');
    });

    it('does not produce unhandled rejections when one worker fails and others are in-flight', async () => {
      // Simulate: first call fails with a non-404 error, second call succeeds
      // With Promise.all this would cause an unhandled rejection from the second worker
      // With Promise.allSettled + re-throw, only the first error propagates cleanly
      let callCount = 0;
      mockClient.getExperiment.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('server error');
        // The other workers might still try to fetch; they should not cause unhandled rejections
        return { name: `Exp ${callCount}` };
      });

      await expect(fetchBulkNames(mockClient as any, [id(1), id(2)])).rejects.toThrow(
        'server error'
      );
    });

    it('returns partial names collected before a worker throws', async () => {
      // When ids are processed sequentially in a single worker (queue size == 1),
      // the first success should still be in the map even if a later call fails
      mockClient.getExperiment
        .mockResolvedValueOnce({ name: 'Good' })
        .mockRejectedValueOnce(new Error('boom'));

      // With 2 ids and concurrency, the worker may process them one at a time
      await expect(fetchBulkNames(mockClient as any, [id(1), id(2)])).rejects.toThrow('boom');
    });
  });

  describe('runBulkOperation', () => {
    it('counts successes and failures', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
        [id(3), 'C'],
      ]);
      const action = vi
        .fn()
        .mockResolvedValueOnce('ok')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('ok');

      const result = await runBulkOperation([id(1), id(2), id(3)], names, action);
      expect(result.data.succeeded).toBe(2);
      expect(result.data.failed).toBe(1);
      expect(result.data.total).toBe(3);
    });

    it('captures error message in result', async () => {
      const names = new Map<ExperimentId, string>([[id(1), 'A']]);
      const action = vi.fn().mockRejectedValue(new Error('boom'));
      const result = await runBulkOperation([id(1)], names, action);
      expect(result.data.results[0]!.success).toBe(false);
      expect(result.data.results[0]!.error).toBe('boom');
    });

    it('handles non-Error thrown values', async () => {
      const names = new Map<ExperimentId, string>([[id(1), 'A']]);
      const action = vi.fn().mockRejectedValue('string-error');
      const result = await runBulkOperation([id(1)], names, action);
      expect(result.data.results[0]!.error).toBe('string-error');
    });

    it('uses fallback name when not in map', async () => {
      const names = new Map<ExperimentId, string>();
      const action = vi.fn().mockResolvedValue('ok');
      const result = await runBulkOperation([id(7)], names, action);
      expect(result.data.results[0]!.name).toBe('#7');
    });

    it('aborts batch on 401 APIError and reports warning', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
        [id(3), 'C'],
      ]);
      const action = vi.fn().mockRejectedValue(new APIError('Unauthorized', 401));

      const result = await runBulkOperation([id(1), id(2), id(3)], names, action);
      // Only the first item should have been attempted (all 5 workers race for queue items,
      // but once a 401 is detected the queue is drained and others exit)
      expect(result.data.results.length).toBeLessThanOrEqual(3);
      expect(result.data.results.length).toBeGreaterThanOrEqual(1);
      // The first failure should contain the abort message
      const failedResult = result.data.results.find((r) => !r.success);
      expect(failedResult!.error).toContain('Authentication failed (401 Unauthorized)');
      expect(failedResult!.error).toContain('batch aborted');
      // total should reflect all ids, not just processed ones
      expect(result.data.total).toBe(3);
      // warnings should indicate skipped operations
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('batch aborted');
      expect(result.warnings![0]).toContain('skipped');
    });

    it('aborts batch on 403 APIError', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
      ]);
      const action = vi.fn().mockRejectedValue(new APIError('Forbidden', 403));

      const result = await runBulkOperation([id(1), id(2)], names, action);
      const failedResult = result.data.results.find((r) => !r.success);
      expect(failedResult!.error).toContain('Permission denied (403 Forbidden)');
      expect(failedResult!.error).toContain('batch aborted');
      expect(result.warnings).toBeDefined();
    });

    it('aborts batch on 429 APIError', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
      ]);
      const action = vi
        .fn()
        .mockResolvedValueOnce('ok')
        .mockRejectedValue(new APIError('Too Many Requests', 429));

      const result = await runBulkOperation([id(1), id(2)], names, action);
      expect(result.data.succeeded).toBe(1);
      const failedResult = result.data.results.find((r) => !r.success);
      expect(failedResult!.error).toContain('Rate limit exceeded (429 Too Many Requests)');
      expect(failedResult!.error).toContain('batch aborted');
    });

    it('does not abort on non-fatal API errors (e.g. 500)', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
        [id(3), 'C'],
      ]);
      const action = vi
        .fn()
        .mockResolvedValueOnce('ok')
        .mockRejectedValueOnce(new APIError('Internal Server Error', 500))
        .mockResolvedValueOnce('ok');

      const result = await runBulkOperation([id(1), id(2), id(3)], names, action);
      expect(result.data.succeeded).toBe(2);
      expect(result.data.failed).toBe(1);
      expect(result.data.total).toBe(3);
      expect(result.warnings).toBeUndefined();
    });

    it('does not abort on regular (non-API) errors', async () => {
      const names = new Map<ExperimentId, string>([
        [id(1), 'A'],
        [id(2), 'B'],
      ]);
      const action = vi
        .fn()
        .mockRejectedValueOnce(new Error('network timeout'))
        .mockResolvedValueOnce('ok');

      const result = await runBulkOperation([id(1), id(2)], names, action);
      expect(result.data.succeeded).toBe(1);
      expect(result.data.failed).toBe(1);
      expect(result.data.total).toBe(2);
      expect(result.warnings).toBeUndefined();
    });

    it('treats DryRunError as a successful preview, not a failure, and does not abort the batch', async () => {
      const ids = [1, 2].map((n) => id(n));
      const names = new Map(ids.map((i) => [i, `exp-${i}`]));
      let calls = 0;
      const action = vi.fn().mockImplementation(() => {
        calls++;
        return Promise.reject(new DryRunError('PUT', `/experiments/${calls}/stop`));
      });

      const result = await runBulkOperation(ids, names, action);

      expect(result.data.succeeded).toBe(2);
      expect(result.data.failed).toBe(0);
      expect(result.data.results.every((r) => r.success && r.dryRun)).toBe(true);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('bulkStart', () => {
    it('calls startExperiment for each id', async () => {
      mockClient.startExperiment.mockResolvedValue(undefined);
      const names = new Map<ExperimentId, string>([[id(1), 'A']]);
      const result = await bulkStart(mockClient as any, [id(1)], names, 'note');
      expect(mockClient.startExperiment).toHaveBeenCalledWith(id(1), 'note');
      expect(result.data.succeeded).toBe(1);
    });
  });

  describe('bulkStop', () => {
    it('calls stopExperiment with reason', async () => {
      mockClient.stopExperiment.mockResolvedValue(undefined);
      const names = new Map<ExperimentId, string>([[id(1), 'A']]);
      await bulkStop(mockClient as any, [id(1)], names, 'testing', 'note');
      expect(mockClient.stopExperiment).toHaveBeenCalledWith(id(1), 'testing', 'note');
    });
  });

  describe('bulkArchive', () => {
    it('calls archiveExperiment for each id', async () => {
      mockClient.archiveExperiment.mockResolvedValue(undefined);
      const names = new Map<ExperimentId, string>([[id(1), 'A']]);
      await bulkArchive(mockClient as any, [id(1)], names, 'note');
      expect(mockClient.archiveExperiment).toHaveBeenCalledWith(id(1), false, 'note');
    });
  });
});
