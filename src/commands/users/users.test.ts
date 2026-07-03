import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usersCommand } from './index.js';
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

describe('users command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listUsers: vi.fn().mockResolvedValue([{ id: 1, email: 'test@test.com' }]),
    listRoles: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue({ id: 1, email: 'test@test.com' }),
    createUser: vi.fn().mockResolvedValue({ id: 99 }),
    updateUser: vi.fn().mockResolvedValue({}),
    archiveUser: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(usersCommand);
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

  it('should list users', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listUsers).toHaveBeenCalledWith({
      includeArchived: undefined,
      items: 20,
      page: 1,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list users with --include-archived', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list', '--include-archived']);

    expect(mockClient.listUsers).toHaveBeenCalledWith({
      includeArchived: true,
      items: 20,
      page: 1,
    });
  });

  it('should forward native --search/--sort/--asc/--ids to the API without scanning', async () => {
    await usersCommand.parseAsync([
      'node',
      'test',
      'list',
      '--search',
      'alice',
      '--sort',
      'email',
      '--asc',
      '--ids',
      '1,2,3',
    ]);

    expect(mockClient.listUsers).toHaveBeenCalledTimes(1);
    expect(mockClient.listUsers).toHaveBeenCalledWith({
      includeArchived: undefined,
      items: 20,
      page: 1,
      search: 'alice',
      sort: 'email',
      sort_asc: true,
      ids: '1,2,3',
    });
  });

  it('should forward --desc as sort_asc false', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list', '--sort', 'email', '--desc']);

    expect(mockClient.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'email', sort_asc: false })
    );
  });

  it('should not scan roles for native --search alone (no client field filter)', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list', '--search', 'alice']);

    // Native path only; no roles column, so no GET /roles scan.
    expect(mockClient.listRoles).not.toHaveBeenCalled();
  });

  it('should error when a filter flag parses to zero usable values', async () => {
    await expect(
      usersCommand.parseAsync(['node', 'test', 'list', '--department', ' , '])
    ).rejects.toThrow('process.exit: 1');
    const logged = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/--department was given no usable values/);
  });

  it('should scan all pages and filter client-side for --department', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, department: 'Ancillaries' }));
    const page2 = [{ id: 201, department: 'Finance' }];
    vi.mocked(mockClient.listUsers)
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any);
    vi.mocked(mockClient.listRoles).mockResolvedValue([] as any);

    await usersCommand.parseAsync(['node', 'test', 'list', '--department', 'Ancillaries']);

    // Two scan pages at 200 items, no native pagination footer path.
    expect(mockClient.listUsers).toHaveBeenCalledTimes(2);
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(1, { page: 1, items: 200 });
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(2, { page: 2, items: 200 });
    // Roles lookup ran (roles column shows for client filters).
    expect(mockClient.listRoles).toHaveBeenCalledTimes(1);
    // Only the 200 Ancillaries users are passed to printFormatted (page 1 of 200).
    expect(printFormatted).toHaveBeenCalledTimes(1);
    const printed = vi.mocked(printFormatted).mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(printed).toHaveLength(20);
    expect(printed.every((r) => r.department === 'Ancillaries')).toBe(true);
    // Filtered footer prints the full matched count plus page info.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('200 results (filtered) — page 1/10')
    );
  });

  it('should paginate the client-filtered matched set (--page 2)', async () => {
    // 250 matching users spread across two scan pages (200 + 50); --items 20 --page 2
    // should return matched[20..40).
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, department: 'Ancillaries' }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      id: i + 201,
      department: 'Ancillaries',
    }));
    vi.mocked(mockClient.listUsers)
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any);
    vi.mocked(mockClient.listRoles).mockResolvedValue([] as any);

    await usersCommand.parseAsync([
      'node',
      'test',
      'list',
      '--department',
      'Ancillaries',
      '--items',
      '20',
      '--page',
      '2',
    ]);

    const printed = vi.mocked(printFormatted).mock.calls[0]![0] as Array<Record<string, unknown>>;
    // Second page of 20: ids 21..40.
    expect(printed).toHaveLength(20);
    expect(printed[0]!.id).toBe(21);
    expect(printed[19]!.id).toBe(40);
    // Footer still reports the full matched count with page info.
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('250 results (filtered) — page 2/13')
    );
  });

  it('should resolve role names and filter by role id', async () => {
    const page1 = [
      { id: 1, first_name: 'Alice', user_team_roles: [{ role_ids: [2] }] },
      { id: 2, first_name: 'Bob', user_team_roles: [{ role_ids: [5] }] },
    ];
    vi.mocked(mockClient.listUsers).mockResolvedValueOnce(page1 as any);
    // First listRoles call resolves the name; second builds the role name map.
    vi.mocked(mockClient.listRoles)
      .mockResolvedValueOnce([
        { id: 1, name: 'Admin' },
        { id: 2, name: 'API User' },
      ] as any)
      .mockResolvedValueOnce([{ id: 2, name: 'API User' }] as any);

    await usersCommand.parseAsync(['node', 'test', 'list', '--role', 'API User']);

    expect(mockClient.listRoles).toHaveBeenCalledTimes(2);
    expect(mockClient.listRoles).toHaveBeenNthCalledWith(1, { search: 'API User', items: 200 });
    const printed = vi.mocked(printFormatted).mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(printed).toHaveLength(1);
    expect(printed[0]!.id).toBe(1);
    expect(printed[0]!.roles).toBe('API User');
  });

  it('should error when a role name matches nothing', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValueOnce([{ id: 1, name: 'Admin' }] as any);

    await expect(
      usersCommand.parseAsync(['node', 'test', 'list', '--role', 'Nonexistent'])
    ).rejects.toThrow('process.exit: 1');
    // The underlying error is logged before the wrapped exit.
    const logged = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/No role found matching name "Nonexistent"/);
  });

  it('should respect --contains for substring department matching', async () => {
    vi.mocked(mockClient.listUsers).mockResolvedValueOnce([
      { id: 1, department: 'Ancillaries' },
      { id: 2, department: 'Finance' },
    ] as any);
    vi.mocked(mockClient.listRoles).mockResolvedValue([] as any);

    await usersCommand.parseAsync(['node', 'test', 'list', '--department', 'Anc', '--contains']);

    const printed = vi.mocked(printFormatted).mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(printed.map((r) => r.id)).toEqual([1, 2]);
  });

  it('should keep raw users untouched (no roles column) with --raw and a filter', async () => {
    const rawUser = {
      id: 1,
      email: 'a@b.c',
      department: 'Ancillaries',
      user_team_roles: [{ role_ids: [2] }],
    };
    vi.mocked(mockClient.listUsers).mockResolvedValueOnce([rawUser] as any);

    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', raw: true } as any);

    await usersCommand.parseAsync(['node', 'test', 'list', '--department', 'Ancillaries']);

    expect(printFormatted).toHaveBeenCalledTimes(1);
    const printed = vi.mocked(printFormatted).mock.calls[0]![0];
    // Raw output is the original user object, not a summarized row with a roles key.
    expect(printed).toEqual([rawUser]);
    // No roles lookup needed in raw mode.
    expect(mockClient.listRoles).not.toHaveBeenCalled();
  });

  it('should get user by id', async () => {
    await usersCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getUser).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.anything()
    );
  });

  it('should create a user', async () => {
    await usersCommand.parseAsync([
      'node',
      'test',
      'create',
      '--email',
      'j@t.com',
      '--name',
      'John Doe',
    ]);

    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'j@t.com',
      first_name: 'John',
      last_name: 'Doe',
    });
  });

  it('should update a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'update', '1', '--name', 'Jane Smith']);

    expect(mockClient.updateUser).toHaveBeenCalledWith(1, {
      first_name: 'Jane',
      last_name: 'Smith',
    });
  });

  it('should archive a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'archive', '1']);

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, undefined);
  });

  it('should unarchive a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'archive', '1', '--unarchive']);

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, true);
  });
});
