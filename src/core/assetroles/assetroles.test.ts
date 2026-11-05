import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listAssetRoles,
  getAssetRole,
  createAssetRole,
  updateAssetRole,
  deleteAssetRole,
} from './assetroles.js';

const mockClient = {
  listAssetRoles: vi.fn(),
  getAssetRole: vi.fn(),
  createAssetRole: vi.fn(),
  updateAssetRole: vi.fn(),
  deleteAssetRole: vi.fn(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('listAssetRoles', () => {
  it('should default items/page and forward to client', async () => {
    const mockData = [{ id: 1 }, { id: 2 }];
    mockClient.listAssetRoles.mockResolvedValue(mockData);

    const result = await listAssetRoles(mockClient, {});

    expect(mockClient.listAssetRoles).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(result.data).toEqual(mockData);
  });

  it('should forward explicit items/page', async () => {
    mockClient.listAssetRoles.mockResolvedValue([]);

    await listAssetRoles(mockClient, { items: 5, page: 3 });

    expect(mockClient.listAssetRoles).toHaveBeenCalledWith({ items: 5, page: 3 });
  });
});

describe('getAssetRole', () => {
  it('should call client.getAssetRole with the id', async () => {
    const mockData = { id: 3, name: 'role' };
    mockClient.getAssetRole.mockResolvedValue(mockData);

    const result = await getAssetRole(mockClient, { id: 3 as any });

    expect(mockClient.getAssetRole).toHaveBeenCalledWith(3);
    expect(result).toEqual({ data: mockData });
  });
});

describe('createAssetRole', () => {
  it('should call client.createAssetRole with name', async () => {
    const mockData = { id: 4, name: 'new-role' };
    mockClient.createAssetRole.mockResolvedValue(mockData);

    const result = await createAssetRole(mockClient, { name: 'new-role' });

    expect(mockClient.createAssetRole).toHaveBeenCalledWith({ name: 'new-role' });
    expect(result).toEqual({ data: mockData });
  });
});

describe('updateAssetRole', () => {
  it('should update with name', async () => {
    mockClient.updateAssetRole.mockResolvedValue(undefined);

    const result = await updateAssetRole(mockClient, { id: 5 as any, name: 'updated' });

    expect(mockClient.updateAssetRole).toHaveBeenCalledWith(5, { name: 'updated' });
    expect(result).toEqual({ data: { id: 5 } });
  });

  it('should throw when no fields provided', async () => {
    await expect(updateAssetRole(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field must be provided'
    );
  });
});

describe('deleteAssetRole', () => {
  it('should call client.deleteAssetRole with the id', async () => {
    mockClient.deleteAssetRole.mockResolvedValue(undefined);

    const result = await deleteAssetRole(mockClient, { id: 8 as any });

    expect(mockClient.deleteAssetRole).toHaveBeenCalledWith(8);
    expect(result).toEqual({ data: { id: 8 } });
  });
});
