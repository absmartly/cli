import { extractAngleBracketed } from '../../lib/utils/linear-match.js';

function extractSearchTerm(query: string): string {
  return extractAngleBracketed(query) ?? query;
}

export async function resolveBySearch<T extends { id: number }>(
  queries: string[],
  searchFn: (query: string) => Promise<T[]>
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
  // Each distinct name costs one backend request. Refuse excessive fan-out
  // before issuing any request, and keep only a few requests in flight.
  if (searchTerms.length > 100) {
    throw new Error('Template references more than 100 distinct names; use numeric IDs instead');
  }
  const batches: T[][] = [];
  for (let i = 0; i < searchTerms.length; i += 5) {
    batches.push(...(await Promise.all(searchTerms.slice(i, i + 5).map(searchFn))));
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
