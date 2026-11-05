import { describe, it, expect, vi } from 'vitest';
import { listTags, getTag, createTag, updateTag, deleteTag } from './tags.js';

describe('tags', () => {
  const mockClient = {
    listExperimentTags: vi.fn(),
    getExperimentTag: vi.fn(),
    createExperimentTag: vi.fn(),
    updateExperimentTag: vi.fn(),
    deleteExperimentTag: vi.fn(),
  };

  it('should list tags with pagination', async () => {
    mockClient.listExperimentTags.mockResolvedValue([{ id: 1 }]);
    const result = await listTags(mockClient as any, { items: 25, page: 1 });
    expect(mockClient.listExperimentTags).toHaveBeenCalledWith({ items: 25, page: 1 });
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should get tag by id', async () => {
    mockClient.getExperimentTag.mockResolvedValue({ id: 1, tag: 'test' });
    const result = await getTag(mockClient as any, { id: 1 as any });
    expect(mockClient.getExperimentTag).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1, tag: 'test' });
  });

  it('should create tag', async () => {
    mockClient.createExperimentTag.mockResolvedValue({ id: 2, tag: 'newtag' });
    const result = await createTag(mockClient as any, { tag: 'newtag' });
    expect(mockClient.createExperimentTag).toHaveBeenCalledWith({ tag: 'newtag' });
    expect(result.data).toEqual({ id: 2, tag: 'newtag' });
  });

  it('should update tag', async () => {
    mockClient.updateExperimentTag.mockResolvedValue({ id: 1, tag: 'updated' });
    const result = await updateTag(mockClient as any, { id: 1 as any, tag: 'updated' });
    expect(mockClient.updateExperimentTag).toHaveBeenCalledWith(1, { tag: 'updated' });
    expect(result.data).toEqual({ id: 1, tag: 'updated' });
  });

  it('should throw when updating with no fields', async () => {
    await expect(updateTag(mockClient as any, { id: 1 as any })).rejects.toThrow(
      'At least one update field must be provided'
    );
  });

  it('should delete tag', async () => {
    mockClient.deleteExperimentTag.mockResolvedValue(undefined);
    const result = await deleteTag(mockClient as any, { id: 1 as any });
    expect(mockClient.deleteExperimentTag).toHaveBeenCalledWith(1);
    expect(result.data).toEqual({ id: 1 });
  });

  describe('listTags rows', () => {
    it('should include summarized rows', async () => {
      const tags = [
        {
          id: 1,
          tag: 'mobile',
          archived: false,
          created_at: '2024-01-01T00:00:00Z',
          created_by: { id: 9, first_name: 'A', last_name: 'B' },
        },
      ];
      mockClient.listExperimentTags.mockResolvedValue(tags);

      const result = await listTags(mockClient as any, { items: 10, page: 1 });

      expect(result.rows).toBeDefined();
      expect(result.rows![0]).toMatchObject({ id: 1, tag: 'mobile', archived: false });
    });
  });
});
