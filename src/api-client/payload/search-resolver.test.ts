import { describe, it, expect, vi } from 'vitest';
import { resolveBySearch } from './search-resolver.js';

describe('resolveBySearch', () => {
  it('has no search limit unless the caller sets one', async () => {
    const search = vi.fn().mockResolvedValue([]);
    await resolveBySearch(
      Array.from({ length: 150 }, (_, i) => `n${i}`),
      search
    );
    expect(search).toHaveBeenCalledTimes(150);
  });

  it('refuses more distinct searches than maxSearches before making requests', async () => {
    const search = vi.fn();
    const queries = [...Array.from({ length: 4 }, (_, i) => `n${i}`), 'n0', '42'];
    await expect(resolveBySearch(queries, search, { maxSearches: 3 })).rejects.toThrow(
      /4 distinct names need a search; the limit is 3/
    );
    expect(search).not.toHaveBeenCalled();
    await expect(
      resolveBySearch(queries, vi.fn().mockResolvedValue([]), { maxSearches: 4 })
    ).resolves.toEqual([{ id: 42 }]);
  });

  it('keeps at most five searches in flight and retains query order', async () => {
    let active = 0;
    let maxActive = 0;
    const queries = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const result = await resolveBySearch(queries, async (name) => {
      maxActive = Math.max(maxActive, ++active);
      await Promise.resolve();
      active--;
      return [{ id: Number(name.slice(1)) }];
    });
    expect(maxActive).toBe(5);
    expect(result.map((r) => r.id)).toEqual(queries.map((_, i) => i));
  });

  it('deduplicates results by id', async () => {
    const searchFn = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ])
      .mockResolvedValueOnce([
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ]);

    const result = await resolveBySearch(['foo', 'bar'], searchFn);

    expect(result).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]);
  });

  it('skips numeric IDs from search but includes them as synthetic results', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ id: 10, name: 'X' }]);

    const result = await resolveBySearch(['42', 'abc'], searchFn);

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn.mock.calls[0]![0]).toBe('abc');
    expect(result).toEqual([{ id: 10, name: 'X' }, { id: 42 }]);
  });

  it('resolves pure numeric IDs without calling searchFn', async () => {
    const searchFn = vi.fn();

    const result = await resolveBySearch(['42', '99'], searchFn);

    expect(searchFn).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 42 }, { id: 99 }]);
  });

  it('resolves mixed names and numeric IDs', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ id: 5, name: 'Clicks' }]);

    const result = await resolveBySearch(['Clicks', '42'], searchFn);

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn.mock.calls[0]![0]).toBe('Clicks');
    expect(result).toEqual([{ id: 5, name: 'Clicks' }, { id: 42 }]);
  });

  it('does not duplicate numeric ID if search already returned it', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ id: 42, name: 'Found' }]);

    const result = await resolveBySearch(['abc', '42'], searchFn);

    expect(result).toEqual([{ id: 42, name: 'Found' }]);
  });

  it('extracts email from angle brackets for search', async () => {
    const searchFn = vi.fn().mockResolvedValue([{ id: 1, name: 'User' }]);

    await resolveBySearch(['John <john@example.com>'], searchFn);

    expect(searchFn.mock.calls[0]![0]).toBe('john@example.com');
  });

  it('returns results from multiple batches', async () => {
    const searchFn = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, name: 'A' }])
      .mockResolvedValueOnce([{ id: 2, name: 'B' }]);

    const result = await resolveBySearch(['alpha', 'beta'], searchFn);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.id).toBe(2);
  });

  it('returns empty array for empty queries', async () => {
    const searchFn = vi.fn();

    const result = await resolveBySearch([], searchFn);

    expect(result).toEqual([]);
    expect(searchFn).not.toHaveBeenCalled();
  });
});
