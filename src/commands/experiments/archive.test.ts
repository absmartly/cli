import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { archiveCommand } from './archive.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { setTTYOverride } from '../../lib/utils/stdin.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

describe('archive command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    archiveExperiment: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(archiveCommand);
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

  it('should archive experiment', async () => {
    await archiveCommand.parseAsync(['node', 'test', '42']);

    expect(mockClient.archiveExperiment).toHaveBeenCalledWith(42, undefined, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('archived');
    expect(output).not.toContain('unarchived');
  });

  it('should unarchive with --unarchive flag', async () => {
    await archiveCommand.parseAsync(['node', 'test', '42', '--unarchive']);

    expect(mockClient.archiveExperiment).toHaveBeenCalledWith(42, true, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('unarchived');
  });

  it('should pass --note to archiveExperiment', async () => {
    await archiveCommand.parseAsync(['node', 'test', '42', '--note', 'my note']);

    expect(mockClient.archiveExperiment).toHaveBeenCalledWith(42, undefined, 'my note');
  });

  it('treats DryRunError as a preview, not a failure', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    try {
      mockClient.archiveExperiment.mockRejectedValueOnce(
        new DryRunError('PUT', '/experiments/42/archive')
      );

      await archiveCommand.parseAsync(['node', 'test', '42']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Experiment 42');
      expect(output).toContain('Dry run: PUT /experiments/42/archive');
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
      const fakeStdin = Readable.from([Buffer.from('10\n20\n30\n')]);
      Object.defineProperty(process, 'stdin', { value: fakeStdin, writable: true });

      await archiveCommand.parseAsync(['node', 'test', '--note', 'batch']);

      expect(mockClient.archiveExperiment).toHaveBeenCalledTimes(3);
      expect(mockClient.archiveExperiment).toHaveBeenCalledWith(10, undefined, 'batch');
      expect(mockClient.archiveExperiment).toHaveBeenCalledWith(20, undefined, 'batch');
      expect(mockClient.archiveExperiment).toHaveBeenCalledWith(30, undefined, 'batch');
    });

    it('should output IDs to stdout when stdout is piped', async () => {
      setTTYOverride({ stdin: false, stdout: false });
      const fakeStdin = Readable.from([Buffer.from('10\n')]);
      Object.defineProperty(process, 'stdin', { value: fakeStdin, writable: true });

      await archiveCommand.parseAsync(['node', 'test', '--note', 'batch']);

      expect(consoleSpy).toHaveBeenCalledWith(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('archived'));
    });
  });
});
