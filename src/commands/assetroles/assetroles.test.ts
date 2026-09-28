import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assetRolesCommand } from './index.js';
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

describe('asset-roles command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listAssetRoles: vi.fn(),
    getAssetRole: vi.fn(),
    createAssetRole: vi.fn(),
    updateAssetRole: vi.fn(),
    deleteAssetRole: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(assetRolesCommand);
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

  it('should list asset roles', async () => {
    mockClient.listAssetRoles.mockResolvedValue([{ id: 1, name: 'editor' }]);
    await assetRolesCommand.parseAsync(['node', 'test', 'list']);
    expect(mockClient.listAssetRoles).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(printFormatted).toHaveBeenCalledWith([{ id: 1, name: 'editor' }], expect.anything());
  });

  it('should list asset roles with pagination', async () => {
    mockClient.listAssetRoles.mockResolvedValue([]);
    await assetRolesCommand.parseAsync(['node', 'test', 'list', '--items', '10', '--page', '2']);
    expect(mockClient.listAssetRoles).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should get asset role by id', async () => {
    mockClient.getAssetRole.mockResolvedValue({ id: 1, name: 'editor' });
    await assetRolesCommand.parseAsync(['node', 'test', 'get', '1']);
    expect(mockClient.getAssetRole).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.anything()
    );
  });

  it('should create asset role', async () => {
    mockClient.createAssetRole.mockResolvedValue({ id: 2, name: 'viewer' });
    await assetRolesCommand.parseAsync(['node', 'test', 'create', '--name', 'viewer']);
    expect(mockClient.createAssetRole).toHaveBeenCalledWith({ name: 'viewer' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
  });

  it('should update asset role', async () => {
    mockClient.updateAssetRole.mockResolvedValue({ id: 1, name: 'new-name' });
    await assetRolesCommand.parseAsync(['node', 'test', 'update', '1', '--name', 'new-name']);
    expect(mockClient.updateAssetRole).toHaveBeenCalledWith(1, { name: 'new-name' });
  });

  it('should delete asset role', async () => {
    mockClient.deleteAssetRole.mockResolvedValue(undefined);
    await assetRolesCommand.parseAsync(['node', 'test', 'delete', '1']);
    expect(mockClient.deleteAssetRole).toHaveBeenCalledWith(1);
  });

  it('should reject invalid id', async () => {
    await expect(assetRolesCommand.parseAsync(['node', 'test', 'get', 'abc'])).rejects.toThrow(
      'is not a valid number'
    );
  });
});
