import { describe, it, expect, vi } from 'vitest';
import {
  listStorageConfigs,
  getStorageConfig,
  createStorageConfig,
  updateStorageConfig,
  testStorageConfig,
} from './storageconfigs.js';

describe('storageconfigs', () => {
  const mockClient = {
    listStorageConfigs: vi.fn(),
    getStorageConfig: vi.fn(),
    createStorageConfig: vi.fn(),
    updateStorageConfig: vi.fn(),
    testStorageConfig: vi.fn(),
  };

  it('should default items/page and forward to client', async () => {
    mockClient.listStorageConfigs.mockResolvedValue([{ id: 1 }]);
    const result = await listStorageConfigs(mockClient as any, {});
    expect(mockClient.listStorageConfigs).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should forward explicit items/page', async () => {
    mockClient.listStorageConfigs.mockResolvedValue([]);
    await listStorageConfigs(mockClient as any, { items: 5, page: 3 });
    expect(mockClient.listStorageConfigs).toHaveBeenCalledWith({ items: 5, page: 3 });
  });

  it('should get storage config by id', async () => {
    mockClient.getStorageConfig.mockResolvedValue({ id: 1, type: 's3' });
    const result = await getStorageConfig(mockClient as any, { id: 1 });
    expect(mockClient.getStorageConfig).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1, type: 's3' });
  });

  it('should create storage config', async () => {
    const config = { type: 's3', bucket: 'test' };
    mockClient.createStorageConfig.mockResolvedValue({ id: 2 });
    const result = await createStorageConfig(mockClient as any, { config });
    expect(mockClient.createStorageConfig).toHaveBeenCalledWith(config);
    expect(result.data).toEqual({ id: 2 });
  });

  it('should update storage config', async () => {
    const config = { bucket: 'updated' };
    mockClient.updateStorageConfig.mockResolvedValue({ id: 1, bucket: 'updated' });
    const result = await updateStorageConfig(mockClient as any, { id: 1, config });
    expect(mockClient.updateStorageConfig).toHaveBeenCalledWith(1, config);
    expect(result.data).toEqual({ id: 1, bucket: 'updated' });
  });

  it('should test storage config', async () => {
    const config = { type: 's3', bucket: 'test' };
    mockClient.testStorageConfig.mockResolvedValue(undefined);
    const result = await testStorageConfig(mockClient as any, { config });
    expect(mockClient.testStorageConfig).toHaveBeenCalledWith(config);
    expect(result.data).toEqual({ success: true });
  });
});
