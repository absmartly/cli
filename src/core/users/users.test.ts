import { describe, it, expect, vi, beforeEach } from 'vitest';
import { archiveUser } from './archive.js';
import { createUser } from './create.js';
import { getUser } from './get.js';
import { listUsers } from './list.js';
import { resetUserPassword } from './reset-password.js';
import { updateUser } from './update.js';

const mockClient = {
  archiveUser: vi.fn(),
  createUser: vi.fn(),
  getUser: vi.fn(),
  listRoles: vi.fn(),
  listUsers: vi.fn(),
  resetUserPassword: vi.fn(),
  updateUser: vi.fn(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('archiveUser', () => {
  it('should archive a user', async () => {
    mockClient.archiveUser.mockResolvedValue(undefined);

    const result = await archiveUser(mockClient, { id: 1 as any });

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, undefined);
    expect(result).toEqual({ data: undefined });
  });

  it('should unarchive a user', async () => {
    mockClient.archiveUser.mockResolvedValue(undefined);

    const result = await archiveUser(mockClient, { id: 1 as any, unarchive: true });

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, true);
    expect(result).toEqual({ data: undefined });
  });
});

describe('createUser', () => {
  it('should split name into first and last', async () => {
    mockClient.createUser.mockResolvedValue({ id: 10 });

    const result = await createUser(mockClient, { email: 'a@b.com', name: 'John Doe' });

    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      first_name: 'John',
      last_name: 'Doe',
    });
    expect(result).toEqual({ data: { id: 10 } });
  });

  it('should handle single name', async () => {
    mockClient.createUser.mockResolvedValue({ id: 11 });

    const result = await createUser(mockClient, { email: 'a@b.com', name: 'Alice' });

    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      first_name: 'Alice',
      last_name: '',
    });
    expect(result).toEqual({ data: { id: 11 } });
  });

  it('should handle multi-part last name', async () => {
    mockClient.createUser.mockResolvedValue({ id: 12 });

    await createUser(mockClient, { email: 'a@b.com', name: 'John Van Der Berg' });

    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      first_name: 'John',
      last_name: 'Van Der Berg',
    });
  });
});

describe('createUser --role', () => {
  it('resolves a role name and sends roles on create', async () => {
    mockClient.listRoles.mockResolvedValueOnce([
      { id: 3, name: 'User' },
      { id: 7, name: 'API User' },
    ]);
    mockClient.createUser.mockResolvedValue({ id: 171 });

    await createUser(mockClient, { email: 'a@b.com', name: 'John Doe', role: 'User' });

    expect(mockClient.listRoles).toHaveBeenCalledWith({ search: 'User', items: 200 });
    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      first_name: 'John',
      last_name: 'Doe',
      roles: [{ role_id: 3 }],
    });
  });

  it('accepts a numeric role id', async () => {
    mockClient.listRoles.mockResolvedValueOnce([{ id: 1, name: 'FullAdmin' }]);
    mockClient.createUser.mockResolvedValue({ id: 172 });

    await createUser(mockClient, { email: 'a@b.com', name: 'John Doe', role: '1' });

    expect(mockClient.listRoles).toHaveBeenCalledWith({ ids: '1', items: 200 });
    expect(mockClient.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ roles: [{ role_id: 1 }] })
    );
  });

  it('does not create the user when the role name is unknown', async () => {
    mockClient.listRoles
      .mockResolvedValueOnce([{ id: 7, name: 'API User' }])
      .mockResolvedValueOnce([
        { id: 1, name: 'FullAdmin' },
        { id: 3, name: 'User' },
      ]);

    await expect(
      createUser(mockClient, { email: 'a@b.com', name: 'John Doe', role: 'Usr' })
    ).rejects.toThrow(/No role found matching name "Usr".*Available roles: FullAdmin, User/s);
    expect(mockClient.createUser).not.toHaveBeenCalled();
  });

  it('keeps the unknown-role error when the suggestions lookup fails', async () => {
    mockClient.listRoles.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network down'));

    const err = await createUser(mockClient, {
      email: 'a@b.com',
      name: 'John Doe',
      role: 'Usr',
    }).catch((e: Error) => e);

    expect((err as Error).message).toMatch(/No role found matching name "Usr"/);
    expect((err as Error).message).not.toMatch(/Available roles/);
    expect(mockClient.createUser).not.toHaveBeenCalled();
  });

  it('omits roles when --role is not given', async () => {
    mockClient.createUser.mockResolvedValue({ id: 173 });

    await createUser(mockClient, { email: 'a@b.com', name: 'John Doe' });

    expect(mockClient.listRoles).not.toHaveBeenCalled();
    expect(mockClient.createUser.mock.calls[0]![0]).not.toHaveProperty('roles');
  });
});

describe('getUser', () => {
  it('should get user by id', async () => {
    const user = { id: 5, email: 'a@b.com' };
    mockClient.getUser.mockResolvedValue(user);

    const result = await getUser(mockClient, { id: 5 as any });

    expect(mockClient.getUser).toHaveBeenCalledWith(5);
    expect(result.data).toMatchObject({ id: 5, email: 'a@b.com' });
  });
});

describe('getUser summarization', () => {
  const user = {
    id: 5,
    email: 'u@x.com',
    first_name: 'U',
    last_name: 'Ser',
    archived: false,
    roles: [{ id: 1, permissions: ['huge array'] }],
  };

  it('returns summarized data by default', async () => {
    mockClient.getUser.mockResolvedValue(user);
    const result = await getUser(mockClient, { id: 5 as any });
    expect(result.data).not.toHaveProperty('roles');
    expect(result.data).toMatchObject({ id: 5, email: 'u@x.com', name: 'U Ser' });
  });

  it('returns raw data when raw=true', async () => {
    mockClient.getUser.mockResolvedValue(user);
    const result = await getUser(mockClient, { id: 5 as any, raw: true });
    expect(result.data).toEqual(user);
  });
});

describe('listUsers', () => {
  it('should list users with pagination', async () => {
    const users = [{ id: 1 }, { id: 2 }];
    mockClient.listUsers.mockResolvedValue(users);

    const result = await listUsers(mockClient, { items: 10, page: 2 });

    expect(mockClient.listUsers).toHaveBeenCalledWith({ items: 10, page: 2 });
    expect(result.data).toEqual(users);
    expect(result.pagination).toEqual({ page: 2, items: 10, hasMore: false });
  });

  it('should use defaults when no params', async () => {
    const users = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    mockClient.listUsers.mockResolvedValue(users);

    const result = await listUsers(mockClient, {});

    expect(mockClient.listUsers).toHaveBeenCalledWith({});
    expect(result.pagination).toEqual({ page: 1, items: 25, hasMore: true });
  });

  it('should pass includeArchived', async () => {
    mockClient.listUsers.mockResolvedValue([]);

    await listUsers(mockClient, { includeArchived: true });

    expect(mockClient.listUsers).toHaveBeenCalledWith({ includeArchived: true });
  });

  it('should forward native search/sort/sortAsc/ids to the API client', async () => {
    mockClient.listUsers.mockResolvedValue([]);

    await listUsers(mockClient, {
      search: 'alice',
      sort: 'email',
      sortAsc: true,
      ids: '1,2',
    });

    expect(mockClient.listUsers).toHaveBeenCalledWith({
      search: 'alice',
      sort: 'email',
      sort_asc: true,
      ids: '1,2',
    });
  });

  it('should not forward undefined native filters', async () => {
    mockClient.listUsers.mockResolvedValue([]);

    await listUsers(mockClient, { items: 10, page: 2 });

    expect(mockClient.listUsers).toHaveBeenCalledWith({ items: 10, page: 2 });
  });
});

describe('listUsers rows', () => {
  it('should include summarized rows', async () => {
    const users = [
      { id: 1, email: 'a@x.com', first_name: 'A', last_name: 'One', archived: false },
      { id: 2, email: 'b@x.com', first_name: 'B', last_name: 'Two', archived: true },
    ];
    mockClient.listUsers.mockResolvedValue(users);

    const result = await listUsers(mockClient, { items: 10, page: 1 });

    expect(result.rows).toEqual([
      {
        id: 1,
        email: 'a@x.com',
        name: 'A One',
        department: '',
        job_title: '',
        archived: false,
        last_login: '',
      },
      {
        id: 2,
        email: 'b@x.com',
        name: 'B Two',
        department: '',
        job_title: '',
        archived: true,
        last_login: '',
      },
    ]);
  });
});

describe('resetUserPassword', () => {
  it('should reset password and return new password', async () => {
    mockClient.resetUserPassword.mockResolvedValue({ password: 'newpass123' });

    const result = await resetUserPassword(mockClient, { id: 5 as any });

    expect(mockClient.resetUserPassword).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: { password: 'newpass123' } });
  });
});

describe('updateUser', () => {
  it('should update user name', async () => {
    mockClient.updateUser.mockResolvedValue(undefined);

    const result = await updateUser(mockClient, { id: 5 as any, name: 'Jane Smith' });

    expect(mockClient.updateUser).toHaveBeenCalledWith(5, {
      first_name: 'Jane',
      last_name: 'Smith',
    });
    expect(result).toEqual({ data: undefined });
  });

  it('treats --role alone as a valid update and sends roles', async () => {
    mockClient.listRoles.mockResolvedValueOnce([{ id: 1, name: 'FullAdmin' }]);
    mockClient.updateUser.mockResolvedValue(undefined);

    await updateUser(mockClient, { id: 171 as any, role: 'FullAdmin' });

    expect(mockClient.updateUser).toHaveBeenCalledWith(171, { roles: [{ role_id: 1 }] });
  });

  it('resolves comma-separated role names and ids together', async () => {
    mockClient.listRoles
      .mockResolvedValueOnce([{ id: 2, name: 'Viewer' }])
      .mockResolvedValueOnce([{ id: 1, name: 'FullAdmin' }]);
    mockClient.updateUser.mockResolvedValue(undefined);

    await updateUser(mockClient, { id: 171 as any, name: 'Jane Smith', role: 'FullAdmin, 2' });

    expect(mockClient.updateUser).toHaveBeenCalledWith(171, {
      first_name: 'Jane',
      last_name: 'Smith',
      roles: [{ role_id: 2 }, { role_id: 1 }],
    });
  });

  it('does not update the user when the role name is unknown', async () => {
    mockClient.listRoles
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, name: 'FullAdmin' }]);

    await expect(updateUser(mockClient, { id: 171 as any, role: 'Nope' })).rejects.toThrow(
      /No role found matching name "Nope"/
    );
    expect(mockClient.updateUser).not.toHaveBeenCalled();
  });

  it('errors when --role has no usable values', async () => {
    await expect(updateUser(mockClient, { id: 171 as any, role: ' , ' })).rejects.toThrow(
      /--role was given no usable values/
    );
    expect(mockClient.listRoles).not.toHaveBeenCalled();
    expect(mockClient.updateUser).not.toHaveBeenCalled();
  });

  it('should throw when no fields provided', async () => {
    await expect(updateUser(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field is required'
    );
  });
});
