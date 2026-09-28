import { describe, it, expect, vi } from 'vitest';
import {
  listExportConfigs,
  getExportConfig,
  createExportConfig,
  updateExportConfig,
  archiveExportConfig,
  pauseExportConfig,
  listExportHistories,
  cancelExportHistory,
} from './exportconfigs.js';

describe('exportconfigs', () => {
  const mockClient = {
    listExportConfigs: vi.fn(),
    getExportConfig: vi.fn(),
    createExportConfig: vi.fn(),
    updateExportConfig: vi.fn(),
    archiveExportConfig: vi.fn(),
    pauseExportConfig: vi.fn(),
    listExportHistories: vi.fn(),
    cancelExportHistory: vi.fn(),
  };

  it('should default items/page and forward to client', async () => {
    mockClient.listExportConfigs.mockResolvedValue([{ id: 1 }]);
    const result = await listExportConfigs(mockClient as any, {});
    expect(mockClient.listExportConfigs).toHaveBeenCalledWith({
      statuses: undefined,
      items: 20,
      page: 1,
    });
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should forward explicit statuses/items/page', async () => {
    mockClient.listExportConfigs.mockResolvedValue([]);
    await listExportConfigs(mockClient as any, { statuses: 'COMPLETED', items: 5, page: 3 });
    expect(mockClient.listExportConfigs).toHaveBeenCalledWith({
      statuses: 'COMPLETED',
      items: 5,
      page: 3,
    });
  });

  it('should get export config by id', async () => {
    mockClient.getExportConfig.mockResolvedValue({ id: 1, name: 'test' });
    const result = await getExportConfig(mockClient as any, { id: 1 as any });
    expect(mockClient.getExportConfig).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1, name: 'test' });
  });

  it('should create export config', async () => {
    const config = { name: 'new', type: 's3' };
    mockClient.createExportConfig.mockResolvedValue({ id: 2, ...config });
    const result = await createExportConfig(mockClient as any, { config });
    expect(mockClient.createExportConfig).toHaveBeenCalledWith(config);
    expect(result.data).toEqual({ id: 2, ...config });
  });

  it('should update export config', async () => {
    const config = { name: 'updated' };
    mockClient.updateExportConfig.mockResolvedValue({ id: 1, ...config });
    const result = await updateExportConfig(mockClient as any, { id: 1 as any, config });
    expect(mockClient.updateExportConfig).toHaveBeenCalledWith(1, config);
    expect(result.data).toEqual({ id: 1, ...config });
  });

  it('should archive export config', async () => {
    mockClient.archiveExportConfig.mockResolvedValue(undefined);
    const result = await archiveExportConfig(mockClient as any, { id: 1 as any });
    expect(mockClient.archiveExportConfig).toHaveBeenCalledWith(1, undefined);
    expect(result.data).toBeUndefined();
  });

  it('should unarchive export config', async () => {
    mockClient.archiveExportConfig.mockResolvedValue(undefined);
    const result = await archiveExportConfig(mockClient as any, { id: 1 as any, unarchive: true });
    expect(mockClient.archiveExportConfig).toHaveBeenCalledWith(1, true);
    expect(result.data).toBeUndefined();
  });

  it('should pause export config', async () => {
    mockClient.pauseExportConfig.mockResolvedValue(undefined);
    const result = await pauseExportConfig(mockClient as any, { id: 1 as any });
    expect(mockClient.pauseExportConfig).toHaveBeenCalledWith(1);
    expect(result.data).toBeUndefined();
  });

  it('should list export histories', async () => {
    mockClient.listExportHistories.mockResolvedValue([{ id: 10, status: 'done' }]);
    const result = await listExportHistories(mockClient as any, { id: 1 as any });
    expect(mockClient.listExportHistories).toHaveBeenCalledWith(1);
    expect(result.data).toEqual([{ id: 10, status: 'done' }]);
  });

  it('should cancel export history with reason', async () => {
    mockClient.cancelExportHistory.mockResolvedValue(undefined);
    const result = await cancelExportHistory(mockClient as any, {
      exportConfigId: 1 as any,
      historyId: 10,
      reason: 'no longer needed',
    });
    expect(mockClient.cancelExportHistory).toHaveBeenCalledWith(1, 10, 'no longer needed');
    expect(result.data).toBeUndefined();
  });

  it('should cancel export history without reason', async () => {
    mockClient.cancelExportHistory.mockResolvedValue(undefined);
    const result = await cancelExportHistory(mockClient as any, {
      exportConfigId: 1 as any,
      historyId: 10,
    });
    expect(mockClient.cancelExportHistory).toHaveBeenCalledWith(1, 10, undefined);
    expect(result.data).toBeUndefined();
  });
});
