import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCommand } from './start.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { setTTYOverride } from '../../lib/utils/stdin.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

describe('start command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    getExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'ready' }),
    startExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'running' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(startCommand);
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

  it('should start experiment by ID', async () => {
    await startCommand.parseAsync(['node', 'test', '42']);

    expect(mockClient.startExperiment).toHaveBeenCalledWith(42, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Experiment 42 started');
  });

  it('should pass --note to startExperiment', async () => {
    await startCommand.parseAsync(['node', 'test', '42', '--note', 'my note']);

    expect(mockClient.startExperiment).toHaveBeenCalledWith(42, 'my note');
  });

  it('should accept experiment name and resolve it', async () => {
    await startCommand.parseAsync(['node', 'test', 'my-experiment']);
    expect(mockClient.resolveExperimentId).toHaveBeenCalledWith('my-experiment');
  });

  it('treats DryRunError as a preview, not a failure', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    try {
      mockClient.startExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/start')
      );

      await startCommand.parseAsync(['node', 'test', '42']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 42');
      expect(output).toContain('Dry run: PUT /experiments/42/start');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = saved;
    }
  });

  it('does not echo the id to stdout for a DryRunError with --pass-through', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    setTTYOverride({ stdin: true, stdout: false });
    try {
      mockClient.startExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/start')
      );

      await startCommand.parseAsync(['node', 'test', '42', '--pass-through']);

      expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('Dry run');
      expect(consoleSpy.mock.calls.some((call) => call[0] === '42')).toBe(false);
      expect(process.exitCode).not.toBe(1);
    } finally {
      setTTYOverride({ stdin: true, stdout: true });
      process.exitCode = saved;
    }
  });
});
