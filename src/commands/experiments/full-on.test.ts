import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server.js';
import { createAPIClient } from '../../lib/api/client.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';
import { fullOnCommand } from './full-on.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

const BASE_URL = TEST_BASE_URL;

describe.skipIf(isLiveMode)('experiments full-on API', () => {
  const client = createAPIClient(BASE_URL, TEST_API_KEY);

  it('should send PUT with variant and note to /experiments/:id/full_on', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    server.use(
      http.put(`${BASE_URL}/experiments/:id/full_on`, async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'full_on', full_on_variant: 1 },
          errors: [],
        });
      })
    );

    await client.fullOnExperiment(42 as any, 1, 'Setting full on variant 1');

    expect(receivedBody).toEqual({
      full_on_variant: 1,
      note: 'Setting full on variant 1',
    });
  });

  it('should return experiment data', async () => {
    server.use(
      http.put(`${BASE_URL}/experiments/:id/full_on`, () => {
        return HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'full_on', full_on_variant: 2 },
          errors: [],
        });
      })
    );

    const result = await client.fullOnExperiment(42 as any, 2, 'test');

    expect(result).toHaveProperty('id', 42);
    expect(result).toHaveProperty('state', 'full_on');
  });
});

describe('full-on command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    fullOnExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'full_on' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(fullOnCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new Error(`process.exit: ${code}`);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should set full-on with --variant', async () => {
    await fullOnCommand.parseAsync(['node', 'test', '42', '--variant', '2']);

    expect(mockClient.fullOnExperiment).toHaveBeenCalledWith(42, 2, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('full-on');
    expect(output).toContain('variant 2');
  });

  it('should pass custom --note', async () => {
    await fullOnCommand.parseAsync(['node', 'test', '42', '--variant', '1', '--note', 'My note']);

    expect(mockClient.fullOnExperiment).toHaveBeenCalledWith(42, 1, 'My note');
  });

  it('treats DryRunError as a preview, not a failure', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    try {
      mockClient.fullOnExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/full_on')
      );

      await fullOnCommand.parseAsync(['node', 'test', '42', '--variant', '1']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 42');
      expect(output).toContain('Dry run: PUT /experiments/42/full_on');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = saved;
    }
  });

  it('should reject --variant 0', async () => {
    await expect(
      fullOnCommand.parseAsync(['node', 'test', '42', '--variant', '0'])
    ).rejects.toThrow('must be an integer >= 1');
  });

  it('should reject non-integer --variant', async () => {
    await expect(
      fullOnCommand.parseAsync(['node', 'test', '42', '--variant', 'abc'])
    ).rejects.toThrow('must be an integer >= 1');
  });
});
