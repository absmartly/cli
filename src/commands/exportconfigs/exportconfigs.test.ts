import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportConfigsCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('export-configs command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listExportConfigs: vi.fn().mockResolvedValue([{ id: 1, name: 'export1' }]),
    getExportConfig: vi.fn().mockResolvedValue({ id: 1, name: 'export1' }),
    createExportConfig: vi.fn().mockResolvedValue({ id: 2 }),
    updateExportConfig: vi.fn().mockResolvedValue({ id: 1 }),
    archiveExportConfig: vi.fn().mockResolvedValue(undefined),
    pauseExportConfig: vi.fn().mockResolvedValue(undefined),
    listExportHistories: vi.fn().mockResolvedValue([{ id: 1 }]),
    cancelExportHistory: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(exportConfigsCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    vi.mocked(printFormatted).mockImplementation(() => {});
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

  it('should list export configs', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listExportConfigs).toHaveBeenCalledWith({
      statuses: undefined,
      items: 20,
      page: 1,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list export configs with pagination', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'list', '--items', '10', '--page', '2']);

    expect(mockClient.listExportConfigs).toHaveBeenCalledWith({
      statuses: undefined,
      items: 10,
      page: 2,
    });
  });

  it('should get export config by id', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getExportConfig).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create an export config', async () => {
    await exportConfigsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--json-config',
      '{"name":"test"}',
    ]);

    expect(mockClient.createExportConfig).toHaveBeenCalledWith({ name: 'test' });
  });

  it('should update an export config', async () => {
    await exportConfigsCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--json-config',
      '{"name":"updated"}',
    ]);

    expect(mockClient.updateExportConfig).toHaveBeenCalledWith(1, { name: 'updated' });
  });

  it('should archive an export config', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'archive', '1']);

    expect(mockClient.archiveExportConfig).toHaveBeenCalledWith(1, false);
  });

  it('should unarchive an export config', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'archive', '1', '--unarchive']);

    expect(mockClient.archiveExportConfig).toHaveBeenCalledWith(1, true);
  });

  it('should pause an export config', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'pause', '1']);

    expect(mockClient.pauseExportConfig).toHaveBeenCalledWith(1);
  });

  it('should list export histories', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'histories', '1']);

    expect(mockClient.listExportHistories).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should cancel an export history', async () => {
    await exportConfigsCommand.parseAsync([
      'node',
      'test',
      'cancel-history',
      '1',
      '42',
      '--reason',
      'No longer needed',
    ]);

    expect(mockClient.cancelExportHistory).toHaveBeenCalledWith(1, 42, 'No longer needed');
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('cancelled');
  });

  it('should cancel an export history without reason', async () => {
    await exportConfigsCommand.parseAsync(['node', 'test', 'cancel-history', '1', '42']);

    expect(mockClient.cancelExportHistory).toHaveBeenCalledWith(1, 42, undefined);
  });
});
