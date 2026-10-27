import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { stopCommand } from './stop.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { setTTYOverride } from '../../lib/utils/stdin.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

describe('stop command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    stopExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'stopped' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(stopCommand);
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

  it('should stop experiment with --reason flag', async () => {
    await stopCommand.parseAsync(['node', 'test', '42', '--reason', 'other']);

    expect(mockClient.stopExperiment).toHaveBeenCalledWith(42, 'other', undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Experiment 42 stopped');
  });

  it('should pass --note to stopExperiment', async () => {
    await stopCommand.parseAsync([
      'node',
      'test',
      '42',
      '--reason',
      'testing',
      '--note',
      'my note',
    ]);

    expect(mockClient.stopExperiment).toHaveBeenCalledWith(42, 'testing', 'my note');
  });

  it('treats DryRunError as a preview, not a failure', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    try {
      mockClient.stopExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/stop')
      );

      await stopCommand.parseAsync(['node', 'test', '42', '--reason', 'other']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 42');
      expect(output).toContain('Dry run: PUT /experiments/42/stop');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = saved;
    }
  });

  describe('stdin pipe support', () => {
    let originalStdin: typeof process.stdin;

    beforeEach(() => {
      originalStdin = process.stdin;
    });

    afterEach(() => {
      Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
      setTTYOverride({ stdin: true, stdout: true });
    });

    it('should read IDs from stdin when piped', async () => {
      setTTYOverride({ stdin: false, stdout: true });
      const fakeStdin = Readable.from([Buffer.from('100\n200\n')]);
      Object.defineProperty(process, 'stdin', { value: fakeStdin, writable: true });

      await stopCommand.parseAsync(['node', 'test', '--reason', 'other', '--note', 'batch']);

      expect(mockClient.stopExperiment).toHaveBeenCalledTimes(2);
      expect(mockClient.stopExperiment).toHaveBeenCalledWith(100, 'other', 'batch');
      expect(mockClient.stopExperiment).toHaveBeenCalledWith(200, 'other', 'batch');
    });

    it('should output IDs to stdout when stdout is piped', async () => {
      setTTYOverride({ stdin: false, stdout: false });
      const fakeStdin = Readable.from([Buffer.from('100\n')]);
      Object.defineProperty(process, 'stdin', { value: fakeStdin, writable: true });

      await stopCommand.parseAsync(['node', 'test', '--reason', 'other', '--note', 'batch']);

      expect(consoleSpy).toHaveBeenCalledWith(100);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Experiment 100 stopped')
      );
    });

    it('should show success on stdout when stdout is not piped', async () => {
      setTTYOverride({ stdin: false, stdout: true });
      const fakeStdin = Readable.from([Buffer.from('100\n')]);
      Object.defineProperty(process, 'stdin', { value: fakeStdin, writable: true });

      await stopCommand.parseAsync(['node', 'test', '--reason', 'other', '--note', 'batch']);

      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 100 stopped');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
