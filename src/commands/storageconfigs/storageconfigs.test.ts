import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storageConfigsCommand } from './index.js';
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

describe('storage-configs command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listStorageConfigs: vi.fn().mockResolvedValue([{ id: 1 }]),
    getStorageConfig: vi.fn().mockResolvedValue({ id: 1 }),
    createStorageConfig: vi.fn().mockResolvedValue({ id: 2 }),
    updateStorageConfig: vi.fn().mockResolvedValue({ id: 1 }),
    testStorageConfig: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(storageConfigsCommand);
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

  it('should list storage configs', async () => {
    await storageConfigsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listStorageConfigs).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list storage configs with pagination', async () => {
    await storageConfigsCommand.parseAsync([
      'node',
      'test',
      'list',
      '--items',
      '10',
      '--page',
      '2',
    ]);

    expect(mockClient.listStorageConfigs).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should get storage config by id', async () => {
    await storageConfigsCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getStorageConfig).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create a storage config', async () => {
    await storageConfigsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--json-config',
      '{"type":"s3"}',
    ]);

    expect(mockClient.createStorageConfig).toHaveBeenCalledWith({ type: 's3' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Storage config created'));
  });

  it('should update a storage config', async () => {
    await storageConfigsCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--json-config',
      '{"bucket":"new"}',
    ]);

    expect(mockClient.updateStorageConfig).toHaveBeenCalledWith(1, { bucket: 'new' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Storage config 1 updated'));
  });

  it('should test a storage config', async () => {
    await storageConfigsCommand.parseAsync([
      'node',
      'test',
      'test',
      '--json-config',
      '{"type":"s3"}',
    ]);

    expect(mockClient.testStorageConfig).toHaveBeenCalledWith({ type: 's3' });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Storage config connection test passed')
    );
  });
});
