import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiCommand } from './index.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

describe('api command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    rawRequest: vi.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(apiCommand);
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

  it('should make GET request by default', async () => {
    await apiCommand.parseAsync(['node', 'test', '/experiments']);

    expect(mockClient.rawRequest).toHaveBeenCalledWith('/experiments', 'GET', undefined, {});
  });

  it('should make POST with --method and --data', async () => {
    await apiCommand.parseAsync([
      'node',
      'test',
      '/experiments',
      '-X',
      'POST',
      '-d',
      '{"name":"test"}',
    ]);

    expect(mockClient.rawRequest).toHaveBeenCalledWith(
      '/experiments',
      'POST',
      { name: 'test' },
      {}
    );
  });

  it('should parse custom headers', async () => {
    await apiCommand.parseAsync(['node', 'test', '/experiments', '-H', 'X-Custom: value']);

    expect(mockClient.rawRequest).toHaveBeenCalledWith('/experiments', 'GET', undefined, {
      'X-Custom': 'value',
    });
  });

  it('should output result as JSON', async () => {
    await apiCommand.parseAsync(['node', 'test', '/experiments']);

    const output = consoleSpy.mock.calls.flat().join('\n');
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({ success: true });
  });

  it('prints a dry-run confirmation instead of the response when the raw request is blocked by --dry-run', async () => {
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: true } as any);
    mockClient.rawRequest.mockRejectedValueOnce(new DryRunError('POST', '/experiments'));

    await apiCommand.parseAsync([
      'node',
      'test',
      '/experiments',
      '-X',
      'POST',
      '-d',
      '{"name":"x"}',
    ]);

    expect(mockClient.rawRequest).toHaveBeenCalledWith('/experiments', 'POST', { name: 'x' }, {});
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls.flat().join(' ')).toContain('Dry run');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should reject invalid JSON in --data', async () => {
    try {
      await apiCommand.parseAsync(['node', 'test', '/experiments', '-d', '{bad json}']);
      throw new Error('Should have thrown');
    } catch (error) {
      if ((error as Error).message.startsWith('process.exit')) {
        const output = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(output).toContain('Invalid JSON');
      } else {
        throw error;
      }
    }
  });

  it('should reject invalid header format', async () => {
    try {
      await apiCommand.parseAsync(['node', 'test', '/experiments', '-H', 'no-colon-here']);
      throw new Error('Should have thrown');
    } catch (error) {
      if ((error as Error).message.startsWith('process.exit')) {
        const output = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(output).toContain('Invalid header format');
      } else {
        throw error;
      }
    }
  });
});
