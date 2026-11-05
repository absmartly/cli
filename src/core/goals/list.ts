import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import { summarizeGoalRow } from '../../api-client/entity-summary.js';

export interface ListGoalsParams {
  items: number;
  page: number;
}

export async function listGoals(
  client: APIClient,
  params: ListGoalsParams
): Promise<CommandResult<unknown[]>> {
  const data = await client.listGoals({ items: params.items, page: params.page });
  return {
    data,
    rows: (data as Array<Record<string, unknown>>).map(summarizeGoalRow),
    pagination: { page: params.page, items: params.items, hasMore: data.length >= params.items },
  };
}
