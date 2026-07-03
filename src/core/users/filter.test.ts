import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseFilterValues,
  hasClientFilters,
  userFullName,
  userGlobalRoleIds,
  resolveRoleIds,
  fetchAllUsers,
  filterUsers,
  buildRoleNameMap,
  formatUserRoles,
  USER_FILTER_SCAN_PAGE_SIZE,
  type UserClientFilters,
} from './filter.js';
import type { APIClient } from '../../api-client/api-client.js';

const mockClient = {
  listUsers: vi.fn(),
  listRoles: vi.fn(),
} as unknown as APIClient;

beforeEach(() => vi.clearAllMocks());

describe('parseFilterValues', () => {
  it('returns [] for undefined/empty/whitespace input', () => {
    expect(parseFilterValues(undefined)).toEqual([]);
    expect(parseFilterValues('')).toEqual([]);
    expect(parseFilterValues('   ')).toEqual([]);
  });

  it('splits comma-separated values, trims, drops blanks', () => {
    expect(parseFilterValues('Ancillaries, Finance , ,API User')).toEqual([
      'Ancillaries',
      'Finance',
      'API User',
    ]);
  });

  it('dedupes case-insensitively keeping first spelling', () => {
    expect(parseFilterValues('Ancillaries,ancillaries,ANCILLARIES')).toEqual(['Ancillaries']);
  });
});

describe('hasClientFilters', () => {
  it('is false when no client filter flags are set', () => {
    expect(hasClientFilters({})).toBe(false);
    expect(hasClientFilters({ search: 'x', sort: 'name' })).toBe(false);
  });

  it('is true when any client filter is set', () => {
    expect(hasClientFilters({ department: 'Ancillaries' })).toBe(true);
    expect(hasClientFilters({ role: 'API User' })).toBe(true);
    expect(hasClientFilters({ jobTitle: 'CEO' })).toBe(true);
    expect(hasClientFilters({ email: 'a@b.com' })).toBe(true);
    expect(hasClientFilters({ name: 'Alice' })).toBe(true);
  });

  it('is false for empty-string values', () => {
    expect(hasClientFilters({ department: '', role: '   ' })).toBe(false);
  });
});

describe('userFullName', () => {
  it('joins first and last name with a space', () => {
    expect(userFullName({ first_name: 'Alice', last_name: 'Smith' })).toBe('Alice Smith');
  });

  it('omits missing parts', () => {
    expect(userFullName({ first_name: 'Alice', last_name: '' })).toBe('Alice');
    expect(userFullName({ first_name: '', last_name: 'Smith' })).toBe('Smith');
    expect(userFullName({})).toBe('');
  });
});

describe('userGlobalRoleIds', () => {
  it('extracts role_ids from user_team_roles entries', () => {
    expect(
      userGlobalRoleIds({
        user_team_roles: [
          { user_id: 1, team_id: 10, role_ids: [5, 7] },
          { user_id: 1, team_id: 20, role_ids: [9] },
        ],
      })
    ).toEqual([5, 7, 9]);
  });

  it('returns [] when user_team_roles is missing or malformed', () => {
    expect(userGlobalRoleIds({})).toEqual([]);
    expect(userGlobalRoleIds({ user_team_roles: 'nope' })).toEqual([]);
    expect(userGlobalRoleIds({ user_team_roles: [{ role_ids: 'nope' }] })).toEqual([]);
  });

  it('tolerates entries without role_ids', () => {
    expect(
      userGlobalRoleIds({
        user_team_roles: [{ team_id: 10 }, { team_id: 20, role_ids: [3] }, { role_ids: [4, 6] }],
      })
    ).toEqual([3, 4, 6]);
  });
});

describe('resolveRoleIds', () => {
  it('validates numeric tokens via a batched listRoles({ ids }) lookup', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ] as any);
    const result = await resolveRoleIds(mockClient, ['1', '2', '3']);
    expect(mockClient.listRoles).toHaveBeenCalledWith({ ids: '1,2,3', items: 200 });
    expect(result).toEqual([1, 2, 3]);
  });

  it('throws when a numeric role ID does not exist', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([{ id: 1, name: 'A' }] as any);
    await expect(resolveRoleIds(mockClient, ['1', '9999'])).rejects.toThrow(
      /No role found with ID 9999/
    );
  });

  it('resolves names exactly and case-insensitively via listRoles search', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([
      { id: 1, name: 'Admin' },
      { id: 2, name: 'API User' },
      { id: 3, name: 'api user backup' },
    ] as any);

    const result = await resolveRoleIds(mockClient, ['API User']);
    expect(mockClient.listRoles).toHaveBeenCalledWith({ search: 'API User', items: 200 });
    expect(result).toEqual([2]);
  });

  it('mixes numeric IDs and resolved names (numerics first)', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([{ id: 2, name: 'API User' }] as any);

    const result = await resolveRoleIds(mockClient, ['2', 'API User']);
    expect(result).toEqual([2]);
  });

  it('dedupes resolved IDs across numeric and name tokens', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([{ id: 2, name: 'API User' }] as any);
    const result = await resolveRoleIds(mockClient, ['API User', '2', 'api user']);
    expect(result).toEqual([2]);
  });

  it('throws when a name matches no role', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([{ id: 1, name: 'Admin' }] as any);
    await expect(resolveRoleIds(mockClient, ['Nonexistent'])).rejects.toThrow(
      /No role found matching name "Nonexistent"/
    );
  });

  it('throws with candidate list when a name matches multiple roles', async () => {
    vi.mocked(mockClient.listRoles).mockResolvedValue([
      { id: 2, name: 'API User' },
      { id: 4, name: 'API User' },
    ] as any);
    await expect(resolveRoleIds(mockClient, ['API User'])).rejects.toThrow(
      /Multiple roles match name "API User":\s*2 API User\s*4 API User/
    );
  });

  it('returns [] for empty values without calling the API', async () => {
    const result = await resolveRoleIds(mockClient, []);
    expect(mockClient.listRoles).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe('fetchAllUsers', () => {
  it('pages through listUsers at 200/page until a short page', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    const page2 = Array.from({ length: 200 }, (_, i) => ({ id: i + 201 }));
    const page3 = Array.from({ length: 25 }, (_, i) => ({ id: i + 401 }));
    vi.mocked(mockClient.listUsers)
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any)
      .mockResolvedValueOnce(page3 as any);

    const result = await fetchAllUsers(mockClient, { includeArchived: true });

    expect(mockClient.listUsers).toHaveBeenCalledTimes(3);
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(1, {
      includeArchived: true,
      page: 1,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    });
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(2, {
      includeArchived: true,
      page: 2,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    });
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(3, {
      includeArchived: true,
      page: 3,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    });
    expect(result).toHaveLength(425);
  });

  it('stops after the first page if it is short', async () => {
    vi.mocked(mockClient.listUsers).mockResolvedValueOnce([{ id: 1 }] as any);
    const result = await fetchAllUsers(mockClient, {});
    expect(mockClient.listUsers).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 1 }]);
  });

  it('forwards native base options (search, sort, sort_asc, ids) to every page', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1 }));
    const page2 = [{ id: 201 }];
    vi.mocked(mockClient.listUsers)
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any);

    await fetchAllUsers(mockClient, { search: 'alice', sort: 'email', sort_asc: true, ids: '1,2' });

    expect(mockClient.listUsers).toHaveBeenNthCalledWith(1, {
      search: 'alice',
      sort: 'email',
      sort_asc: true,
      ids: '1,2',
      page: 1,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    });
    expect(mockClient.listUsers).toHaveBeenNthCalledWith(2, {
      search: 'alice',
      sort: 'email',
      sort_asc: true,
      ids: '1,2',
      page: 2,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    });
  });
});

describe('filterUsers', () => {
  const users: Array<Record<string, unknown>> = [
    {
      id: 1,
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@acme.com',
      department: 'Ancillaries',
      job_title: 'CEO',
      user_team_roles: [{ role_ids: [2, 3] }],
    },
    {
      id: 2,
      first_name: 'Bob',
      last_name: 'Jones',
      email: 'bob@acme.com',
      department: 'Finance',
      job_title: 'Analyst',
      user_team_roles: [{ role_ids: [5] }],
    },
    {
      id: 3,
      first_name: 'Carol',
      last_name: 'Lee',
      email: 'carol@acme.com',
      department: 'Ancillaries',
      job_title: 'Engineer',
      user_team_roles: [{ role_ids: [2, 9] }],
    },
  ];

  it('matches department exactly (case-insensitive), OR within values', () => {
    const filters: UserClientFilters = { department: ['Ancillaries', 'Finance'] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it('AND across fields: department AND role', () => {
    const filters: UserClientFilters = { department: ['Ancillaries'], roleIds: [3] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1]);
  });

  it('matches email exactly', () => {
    const filters: UserClientFilters = { email: ['bob@acme.com'] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([2]);
  });

  it('matches name on the full first+last name', () => {
    const filters: UserClientFilters = { name: ['Alice Smith'] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1]);
  });

  it('matches job title exactly', () => {
    const filters: UserClientFilters = { jobTitle: ['CEO'] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1]);
  });

  it('role matches if any of the user role_ids is in the requested set', () => {
    const filters: UserClientFilters = { roleIds: [5, 9] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([2, 3]);
  });

  it('with contains=true, matches substrings for a single field', () => {
    const filters: UserClientFilters = { department: ['ancill'] };
    // 'Finance' does not contain 'ancill'; 'Ancillaries' does.
    expect(filterUsers(users, filters, { contains: true }).map((u) => u.id)).toEqual([1, 3]);
  });

  it('with contains=true, still ANDs across fields', () => {
    const filters: UserClientFilters = { name: ['smi'], department: ['ancill'] };
    // Only Alice has both a name containing 'smi' and a department containing 'ancill'.
    expect(filterUsers(users, filters, { contains: true }).map((u) => u.id)).toEqual([1]);
  });

  it('contains does not affect role matching (role stays ID-exact)', () => {
    const filters: UserClientFilters = { roleIds: [2], name: ['smi'] };
    expect(filterUsers(users, filters, { contains: true }).map((u) => u.id)).toEqual([1]);
  });

  it('returns all users when a field has an empty value array', () => {
    const filters: UserClientFilters = { department: [] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1, 2, 3]);
  });

  it('returns the same user references (no mutation) when no role tagging', () => {
    const filters: UserClientFilters = { department: ['Ancillaries'] };
    const result = filterUsers(users, filters);
    expect(result[0]).toBe(users[0]);
  });

  it('is case-insensitive on exact department match', () => {
    const filters: UserClientFilters = { department: ['ancillaries'] };
    expect(filterUsers(users, filters).map((u) => u.id)).toEqual([1, 3]);
  });
});

describe('buildRoleNameMap', () => {
  it('scans all roles pages at 200/page and maps id -> name', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, name: `Role ${i + 1}` }));
    const page2 = [{ id: 201, name: 'Role 201' }];
    vi.mocked(mockClient.listRoles)
      .mockResolvedValueOnce(page1 as any)
      .mockResolvedValueOnce(page2 as any);

    const map = await buildRoleNameMap(mockClient);
    expect(mockClient.listRoles).toHaveBeenCalledTimes(2);
    expect(mockClient.listRoles).toHaveBeenNthCalledWith(1, { page: 1, items: 200 });
    expect(mockClient.listRoles).toHaveBeenNthCalledWith(2, { page: 2, items: 200 });
    expect(map.get(1)).toBe('Role 1');
    expect(map.get(201)).toBe('Role 201');
    expect(map.size).toBe(201);
  });
});

describe('formatUserRoles', () => {
  const roleNames = new Map<number, string>([
    [2, 'API User'],
    [3, 'Admin'],
  ]);

  it('maps user role IDs to names and joins with ", "', () => {
    expect(formatUserRoles({ user_team_roles: [{ role_ids: [2, 3] }] }, roleNames)).toBe(
      'API User, Admin'
    );
  });

  it('falls back to #<id> for unknown role IDs', () => {
    expect(formatUserRoles({ user_team_roles: [{ role_ids: [2, 99] }] }, roleNames)).toBe(
      'API User, #99'
    );
  });

  it('returns an empty string when the user has no roles', () => {
    expect(formatUserRoles({}, roleNames)).toBe('');
    expect(formatUserRoles({ user_team_roles: [] }, roleNames)).toBe('');
  });

  it('sorts role names deterministically by role ID', () => {
    expect(formatUserRoles({ user_team_roles: [{ role_ids: [3, 2] }] }, roleNames)).toBe(
      'API User, Admin'
    );
  });
});
