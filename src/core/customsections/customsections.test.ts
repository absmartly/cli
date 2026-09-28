import { describe, it, expect, vi } from 'vitest';
import {
  listCustomSections,
  createCustomSection,
  updateCustomSection,
  archiveCustomSection,
  reorderCustomSections,
} from './customsections.js';

describe('customsections', () => {
  const mockClient = {
    listCustomSections: vi.fn(),
    createCustomSection: vi.fn(),
    updateCustomSection: vi.fn(),
    archiveCustomSection: vi.fn(),
    reorderCustomSections: vi.fn(),
  };

  it('should default items/page and forward to client', async () => {
    mockClient.listCustomSections.mockResolvedValue([{ id: 1 }]);
    const result = await listCustomSections(mockClient as any, {});
    expect(mockClient.listCustomSections).toHaveBeenCalledWith({
      type: undefined,
      items: 20,
      page: 1,
    });
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should forward explicit type/items/page', async () => {
    mockClient.listCustomSections.mockResolvedValue([]);
    await listCustomSections(mockClient as any, { type: 'text', items: 5, page: 3 });
    expect(mockClient.listCustomSections).toHaveBeenCalledWith({
      type: 'text',
      items: 5,
      page: 3,
    });
  });

  it('should create custom section', async () => {
    mockClient.createCustomSection.mockResolvedValue({ id: 2, name: 'new', type: 'text' });
    const result = await createCustomSection(mockClient as any, { name: 'new', type: 'text' });
    expect(mockClient.createCustomSection).toHaveBeenCalledWith({ name: 'new', type: 'text' });
    expect(result.data).toEqual({ id: 2, name: 'new', type: 'text' });
  });

  it('should update custom section with name', async () => {
    mockClient.updateCustomSection.mockResolvedValue({ id: 1, name: 'updated' });
    const result = await updateCustomSection(mockClient as any, { id: 1 as any, name: 'updated' });
    expect(mockClient.updateCustomSection).toHaveBeenCalledWith(1, { name: 'updated' });
    expect(result.data).toEqual({ id: 1, name: 'updated' });
  });

  it('should throw when updating with no fields', async () => {
    await expect(updateCustomSection(mockClient as any, { id: 1 as any })).rejects.toThrow(
      'At least one update field must be provided'
    );
  });

  it('should archive custom section', async () => {
    mockClient.archiveCustomSection.mockResolvedValue(undefined);
    const result = await archiveCustomSection(mockClient as any, { id: 1 as any });
    expect(mockClient.archiveCustomSection).toHaveBeenCalledWith(1, false);
    expect(result.data).toEqual({ id: 1, archived: true });
  });

  it('should unarchive custom section', async () => {
    mockClient.archiveCustomSection.mockResolvedValue(undefined);
    const result = await archiveCustomSection(mockClient as any, { id: 1 as any, unarchive: true });
    expect(mockClient.archiveCustomSection).toHaveBeenCalledWith(1, true);
    expect(result.data).toEqual({ id: 1, archived: false });
  });

  it('should reorder custom sections', async () => {
    mockClient.reorderCustomSections.mockResolvedValue(undefined);
    const sections = [
      { id: 1, order_index: 0 },
      { id: 2, order_index: 1 },
    ];
    const result = await reorderCustomSections(mockClient as any, { sections });
    expect(mockClient.reorderCustomSections).toHaveBeenCalledWith(sections);
    expect(result.data).toEqual({ reordered: true });
  });
});
