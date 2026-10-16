import { extractAngleBracketed } from '../../lib/utils/linear-match.js';

function extractSearchTerm(query: string): string {
  return extractAngleBracketed(query) ?? query;
}

export interface ResolveBySearchOptions {
  /**
   * Refuse, before any request, when more than this many distinct names need
   * a search. Each costs one backend request; callers handling untrusted input
   * (templates over /mcp) set it.
   */
  maxSearches?: number;
}

const SEARCH_CONCURRENCY = 5;

export async function resolveBySearch<T extends { id: number }>(
  queries: string[],
  searchFn: (query: string) => Promise<T[]>,
  options: ResolveBySearchOptions = {}
): Promise<T[]> {
  const seen = new Set<number>();
  const results: T[] = [];
  const numericIds: number[] = [];
  const searchTerms = [
    ...new Set(
      queries
        .filter((q) => {
          const asInt = parseInt(q, 10);
          if (!isNaN(asInt) && String(asInt) === q.trim()) {
            numericIds.push(asInt);
            return false;
          }
          return true;
        })
        .map(extractSearchTerm)
    ),
  ];
  const { maxSearches } = options;
  if (maxSearches !== undefined && searchTerms.length > maxSearches) {
    throw new Error(
      `${searchTerms.length} distinct names need a search; the limit is ${maxSearches}. Use numeric IDs instead`
    );
  }
  // Keep only a few requests in flight rather than one per name at once.
  const batches: T[][] = [];
  for (let i = 0; i < searchTerms.length; i += SEARCH_CONCURRENCY) {
    const chunk = searchTerms.slice(i, i + SEARCH_CONCURRENCY);
    batches.push(...(await Promise.all(chunk.map(searchFn))));
  }
  for (const batch of batches) {
    for (const item of batch) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }
  for (const numId of numericIds) {
    if (!seen.has(numId)) {
      seen.add(numId);
      results.push({ id: numId } as T);
    }
  }
  return results;
}
