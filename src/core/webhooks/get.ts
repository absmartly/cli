import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import type { WebhookId } from '../../lib/api/branded-types.js';
import { applyShowExclude, summarizeWebhook } from '../../api-client/entity-summary.js';

export interface GetWebhookParams {
  id: WebhookId;
  show?: string[] | undefined;
  exclude?: string[] | undefined;
  showOnly?: string[] | undefined;
  raw?: boolean | undefined;
}

export async function getWebhook(
  client: APIClient,
  params: GetWebhookParams
): Promise<CommandResult<unknown>> {
  const webhook = await client.getWebhook(params.id);
  const show = params.show ?? [];
  const exclude = params.exclude ?? [];

  const data = params.raw
    ? webhook
    : applyShowExclude(
        summarizeWebhook(webhook as Record<string, unknown>),
        webhook as Record<string, unknown>,
        show,
        exclude,
        params.showOnly
      );
  return { data };
}
