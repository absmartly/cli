import { describe, it, expect, vi } from 'vitest';
import { listPermissions, listPermissionCategories, listAccessControlPolicies } from './list.js';

describe('permissions', () => {
  const mockClient = {
    listPermissions: vi.fn(),
    listPermissionCategories: vi.fn(),
    listAccessControlPolicies: vi.fn(),
  };

  it('should list permissions', async () => {
    mockClient.listPermissions.mockResolvedValue([{ id: 1, name: 'read' }]);
    const result = await listPermissions(mockClient as any);
    expect(mockClient.listPermissions).toHaveBeenCalled();
    expect(result.data).toEqual([{ id: 1, name: 'read' }]);
  });

  it('should list permission categories', async () => {
    mockClient.listPermissionCategories.mockResolvedValue([{ id: 1, name: 'experiments' }]);
    const result = await listPermissionCategories(mockClient as any);
    expect(mockClient.listPermissionCategories).toHaveBeenCalled();
    expect(result.data).toEqual([{ id: 1, name: 'experiments' }]);
  });

  it('should list access control policies', async () => {
    mockClient.listAccessControlPolicies.mockResolvedValue([{ id: 1, name: 'default' }]);
    const result = await listAccessControlPolicies(mockClient as any);
    expect(mockClient.listAccessControlPolicies).toHaveBeenCalled();
    expect(result.data).toEqual([{ id: 1, name: 'default' }]);
  });
});

describe('listPermissions pagination', () => {
  const mockClient = { listPermissions: vi.fn() };

  it('should pass items/page to the client', async () => {
    mockClient.listPermissions.mockResolvedValue([]);
    await listPermissions(mockClient as any, { items: 25, page: 2 });
    expect(mockClient.listPermissions).toHaveBeenCalledWith({ items: 25, page: 2 });
  });
});

describe('listPermissionCategories pagination', () => {
  const mockClient = { listPermissionCategories: vi.fn() };

  it('should pass items/page to the client', async () => {
    mockClient.listPermissionCategories.mockResolvedValue([]);
    await listPermissionCategories(mockClient as any, { items: 25, page: 2 });
    expect(mockClient.listPermissionCategories).toHaveBeenCalledWith({ items: 25, page: 2 });
  });
});

describe('listAccessControlPolicies pagination', () => {
  const mockClient = { listAccessControlPolicies: vi.fn() };

  it('should pass items/page to the client', async () => {
    mockClient.listAccessControlPolicies.mockResolvedValue([]);
    await listAccessControlPolicies(mockClient as any, { items: 25, page: 2 });
    expect(mockClient.listAccessControlPolicies).toHaveBeenCalledWith({ items: 25, page: 2 });
  });
});
