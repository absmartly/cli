import { describe, it, expect, vi } from 'vitest';
import {
  listCorsOrigins,
  getCorsOrigin,
  createCorsOrigin,
  updateCorsOrigin,
  deleteCorsOrigin,
} from './cors.js';

describe('cors', () => {
  const mockClient = {
    listCorsOrigins: vi.fn(),
    getCorsOrigin: vi.fn(),
    createCorsOrigin: vi.fn(),
    updateCorsOrigin: vi.fn(),
    deleteCorsOrigin: vi.fn(),
  };

  it('should default items/page and forward to client', async () => {
    mockClient.listCorsOrigins.mockResolvedValue([{ id: 1 }]);
    const result = await listCorsOrigins(mockClient as any, {});
    expect(mockClient.listCorsOrigins).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should forward explicit items/page', async () => {
    mockClient.listCorsOrigins.mockResolvedValue([]);
    await listCorsOrigins(mockClient as any, { items: 5, page: 3 });
    expect(mockClient.listCorsOrigins).toHaveBeenCalledWith({ items: 5, page: 3 });
  });

  it('should get cors origin by id', async () => {
    mockClient.getCorsOrigin.mockResolvedValue({ id: 1, origin: 'http://example.com' });
    const result = await getCorsOrigin(mockClient as any, { id: 1 as any });
    expect(mockClient.getCorsOrigin).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1, origin: 'http://example.com' });
  });

  it('should create cors origin', async () => {
    mockClient.createCorsOrigin.mockResolvedValue({ id: 2, origin: 'http://new.com' });
    const result = await createCorsOrigin(mockClient as any, { origin: 'http://new.com' });
    expect(mockClient.createCorsOrigin).toHaveBeenCalledWith({ origin: 'http://new.com' });
    expect(result.data).toEqual({ id: 2, origin: 'http://new.com' });
  });

  it('should update cors origin', async () => {
    mockClient.updateCorsOrigin.mockResolvedValue({ id: 1, origin: 'http://updated.com' });
    const result = await updateCorsOrigin(mockClient as any, {
      id: 1 as any,
      origin: 'http://updated.com',
    });
    expect(mockClient.updateCorsOrigin).toHaveBeenCalledWith(1, { origin: 'http://updated.com' });
    expect(result.data).toEqual({ id: 1, origin: 'http://updated.com' });
  });

  it('should delete cors origin', async () => {
    mockClient.deleteCorsOrigin.mockResolvedValue(undefined);
    const result = await deleteCorsOrigin(mockClient as any, { id: 1 as any });
    expect(mockClient.deleteCorsOrigin).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1 });
  });
});
