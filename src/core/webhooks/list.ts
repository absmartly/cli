import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import { summarizeWebhookRow } from '../../api-client/entity-summary.js';

export interface ListWebhooksParams {
  items: number;
  page: number;
}

export async function listWebhooks(
  client: APIClient,
  params: ListWebhooksParams
): Promise<CommandResult<unknown[]>> {
  const data = await client.listWebhooks({ items: params.items, page: params.page });
  return { data, rows: (data as Array<Record<string, unknown>>).map(summarizeWebhookRow) };
}
