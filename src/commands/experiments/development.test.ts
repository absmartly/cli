import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server.js';
import { createAPIClient } from '../../lib/api/client.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';
import { developmentCommand } from './development.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

const BASE_URL = TEST_BASE_URL;

describe.skipIf(isLiveMode)('experiments development API', () => {
  const client = createAPIClient(BASE_URL, TEST_API_KEY);

  it('should send PUT with note to /experiments/:id/development', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    let receivedMethod = '';
    server.use(
      http.put(`${BASE_URL}/experiments/:id/development`, async ({ request }) => {
        receivedMethod = request.method;
        receivedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'development' },
          errors: [],
        });
      })
    );

    await client.developmentExperiment(42 as any, 'Starting development');

    expect(receivedMethod).toBe('PUT');
    expect(receivedBody).toEqual({ note: 'Starting development' });
  });

  it('should return experiment data from response', async () => {
    server.use(
      http.put(`${BASE_URL}/experiments/:id/development`, () => {
        return HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'development', name: 'test_exp' },
          errors: [],
        });
      })
    );

    const result = await client.developmentExperiment(42 as any, 'test note');

    expect(result).toHaveProperty('id', 42);
    expect(result).toHaveProperty('state', 'development');
  });
});

describe('development command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    developmentExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'development' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(developmentCommand);
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

  it('should call with undefined note when not provided', async () => {
    await developmentCommand.parseAsync(['node', 'test', '42']);

    expect(mockClient.developmentExperiment).toHaveBeenCalledWith(42, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('set to development mode');
  });

  it('should pass custom --note', async () => {
    await developmentCommand.parseAsync(['node', 'test', '42', '--note', 'Custom reason']);

    expect(mockClient.developmentExperiment).toHaveBeenCalledWith(42, 'Custom reason');
  });

  it('treats DryRunError as a preview, not a failure', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    try {
      mockClient.developmentExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/development')
      );

      await developmentCommand.parseAsync(['node', 'test', '42']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 42');
      expect(output).toContain('Dry run: PUT /experiments/42/development');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = saved;
    }
  });
});
