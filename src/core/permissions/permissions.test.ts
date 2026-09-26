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

  it('should slice client-side and warn when the server ignores items/page', async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    mockClient.listPermissions.mockResolvedValue(all);
    const result = await listPermissions(mockClient as any, { items: 20, page: 1 });
    expect((result.data as unknown[]).length).toBe(20);
    expect(result.warnings).toEqual(['Showing 20 of 30 results. Use --page to see more.']);
    expect(result.pagination?.hasMore).toBe(true);
  });

  it('should return the correct slice for page 2 and report hasMore false at the end', async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    mockClient.listPermissions.mockResolvedValue(all);
    const result = await listPermissions(mockClient as any, { items: 20, page: 2 });
    expect((result.data as unknown[]).length).toBe(10);
    expect(result.pagination?.hasMore).toBe(false);
  });

  it('should not warn to see more on the final page even though the full list exceeds items', async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    mockClient.listPermissions.mockResolvedValue(all);
    const result = await listPermissions(mockClient as any, { items: 20, page: 2 });
    expect(result.warnings).toBeUndefined();
  });

  it('should not warn when everything fits on one page', async () => {
    mockClient.listPermissions.mockResolvedValue([{ id: 1 }]);
    const result = await listPermissions(mockClient as any, { items: 20, page: 1 });
    expect(result.warnings).toBeUndefined();
  });
});

describe('listPermissionCategories pagination', () => {
  const mockClient = { listPermissionCategories: vi.fn() };

  it('should pass items/page to the client', async () => {
    mockClient.listPermissionCategories.mockResolvedValue([]);
    await listPermissionCategories(mockClient as any, { items: 25, page: 2 });
    expect(mockClient.listPermissionCategories).toHaveBeenCalledWith({ items: 25, page: 2 });
  });

  it('should slice client-side and warn when the server ignores items/page', async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    mockClient.listPermissionCategories.mockResolvedValue(all);
    const result = await listPermissionCategories(mockClient as any, { items: 20, page: 1 });
    expect((result.data as unknown[]).length).toBe(20);
    expect(result.warnings).toEqual(['Showing 20 of 30 results. Use --page to see more.']);
  });
});

describe('listAccessControlPolicies pagination', () => {
  const mockClient = { listAccessControlPolicies: vi.fn() };

  it('should pass items/page to the client', async () => {
    mockClient.listAccessControlPolicies.mockResolvedValue([]);
    await listAccessControlPolicies(mockClient as any, { items: 25, page: 2 });
    expect(mockClient.listAccessControlPolicies).toHaveBeenCalledWith({ items: 25, page: 2 });
  });

  it('should slice client-side and warn when the server ignores items/page', async () => {
    const all = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    mockClient.listAccessControlPolicies.mockResolvedValue(all);
    const result = await listAccessControlPolicies(mockClient as any, { items: 20, page: 1 });
    expect((result.data as unknown[]).length).toBe(20);
    expect(result.warnings).toEqual(['Showing 20 of 30 results. Use --page to see more.']);
  });
});
