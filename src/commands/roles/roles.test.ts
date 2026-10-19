import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rolesCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { summarizeNamedEntityRow } from '../../api-client/entity-summary.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('roles command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listRoles: vi.fn().mockResolvedValue([{ id: 1, name: 'admin' }]),
    getRole: vi.fn().mockResolvedValue({ id: 1, name: 'admin' }),
    listPermissionCategories: vi.fn().mockResolvedValue([{ id: 9, name: 'Experiments' }]),
    createRole: vi.fn().mockResolvedValue({ id: 99 }),
    updateRole: vi.fn().mockResolvedValue({}),
    deleteRole: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(rolesCommand);
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

  it('should list roles', async () => {
    await rolesCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listRoles).toHaveBeenCalledWith(
      expect.objectContaining({ items: 20, page: 1 })
    );
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should get role by id', async () => {
    await rolesCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getRole).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.anything()
    );
  });

  it('shows role permissions grouped by category name', async () => {
    mockClient.getRole.mockResolvedValueOnce({
      id: 1,
      permissions: [
        { permission: { name: 'Get', category_id: 9 } },
        { permission: { name: 'List', category_id: 9 } },
      ],
    });
    await rolesCommand.parseAsync(['node', 'test', 'get', '1']);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { Experiments: 'Get, List' } }),
      expect.anything()
    );
  });

  it('should create a role', async () => {
    await rolesCommand.parseAsync(['node', 'test', 'create', '--name', 'editor']);

    expect(mockClient.createRole).toHaveBeenCalledWith({ name: 'editor' });
  });

  it('should update a role', async () => {
    await rolesCommand.parseAsync(['node', 'test', 'update', '1', '--description', 'x']);

    expect(mockClient.updateRole).toHaveBeenCalledWith(1, { description: 'x' });
  });

  it('should delete a role', async () => {
    await rolesCommand.parseAsync(['node', 'test', 'delete', '1']);

    expect(mockClient.deleteRole).toHaveBeenCalledWith(1);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Role 1 deleted');
  });
});

describe('roles list summarizer', () => {
  it('uses summarizeNamedEntityRow for clean columns', () => {
    expect(
      summarizeNamedEntityRow({
        id: 1,
        name: 'admin',
        description: 'all powerful',
        archived: false,
        created_by: { email: 'root@x' },
      }).created_by
    ).toBe('root@x');
  });
});
