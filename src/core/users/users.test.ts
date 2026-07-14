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

describe('getUser', () => {
  it('should get user by id', async () => {
    const user = { id: 5, email: 'a@b.com' };
    mockClient.getUser.mockResolvedValue(user);

    const result = await getUser(mockClient, { id: 5 as any });

    expect(mockClient.getUser).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: user });
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

  it('should throw when no fields provided', async () => {
    await expect(updateUser(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field is required'
    );
  });

  it('should update role alone as [{ role_id }]', async () => {
    mockClient.updateUser.mockResolvedValue(undefined);

    const result = await updateUser(mockClient, { id: 5 as any, role: '34' });

    expect(mockClient.updateUser).toHaveBeenCalledWith(5, {
      roles: [{ role_id: 34 }],
    });
    expect(result).toEqual({ data: undefined });
  });

  it('should update name and role together', async () => {
    mockClient.updateUser.mockResolvedValue(undefined);

    await updateUser(mockClient, { id: 7 as any, name: 'Jane Smith', role: '2' });

    expect(mockClient.updateUser).toHaveBeenCalledWith(7, {
      first_name: 'Jane',
      last_name: 'Smith',
      roles: [{ role_id: 2 }],
    });
  });

  it('should throw on an invalid role value', async () => {
    await expect(updateUser(mockClient, { id: 5 as any, role: 'admin' })).rejects.toThrow(
      'Invalid role'
    );
    expect(mockClient.updateUser).not.toHaveBeenCalled();
  });
});
