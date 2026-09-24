import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { permissionsCommand } from './index.js';
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

describe('permissions command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listPermissions: vi.fn().mockResolvedValue([{ id: 1, name: 'read' }]),
    listPermissionCategories: vi.fn().mockResolvedValue([{ id: 1, name: 'experiments' }]),
    listAccessControlPolicies: vi.fn().mockResolvedValue([{ id: 1, name: 'policy1' }]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(permissionsCommand);
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

  it('should list permissions', async () => {
    await permissionsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listPermissions).toHaveBeenCalled();
    expect(printFormatted).toHaveBeenCalledWith([{ id: 1, name: 'read' }], expect.anything());
  });

  it('should list permission categories', async () => {
    await permissionsCommand.parseAsync(['node', 'test', 'categories']);

    expect(mockClient.listPermissionCategories).toHaveBeenCalled();
    expect(printFormatted).toHaveBeenCalledWith(
      [{ id: 1, name: 'experiments' }],
      expect.anything()
    );
  });

  it('should list access control policies', async () => {
    await permissionsCommand.parseAsync(['node', 'test', 'policies']);

    expect(mockClient.listAccessControlPolicies).toHaveBeenCalled();
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list permissions with pagination', async () => {
    await permissionsCommand.parseAsync(['node', 'test', 'list', '--items', '10', '--page', '2']);

    expect(mockClient.listPermissions).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should list permission categories with pagination', async () => {
    await permissionsCommand.parseAsync([
      'node',
      'test',
      'categories',
      '--items',
      '10',
      '--page',
      '2',
    ]);

    expect(mockClient.listPermissionCategories).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should list access control policies with pagination', async () => {
    await permissionsCommand.parseAsync([
      'node',
      'test',
      'policies',
      '--items',
      '10',
      '--page',
      '2',
    ]);

    expect(mockClient.listAccessControlPolicies).toHaveBeenCalledWith({ items: 10, page: 2 });
  });
});
