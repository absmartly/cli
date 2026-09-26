import type { APIClient } from '../../api-client/api-client.js';
import type { UserId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';
import { applyShowExclude, summarizeUserDetail } from '../../api-client/entity-summary.js';

export interface GetUserParams {
  id: UserId;
  show?: string[] | undefined;
  exclude?: string[] | undefined;
  showOnly?: string[] | undefined;
  raw?: boolean | undefined;
}

export async function getUser(
  client: APIClient,
  params: GetUserParams
): Promise<CommandResult<unknown>> {
  const user = await client.getUser(params.id);
  const show = params.show ?? [];
  const exclude = params.exclude ?? [];

  const data = params.raw
    ? user
    : applyShowExclude(
        summarizeUserDetail(user as Record<string, unknown>),
        user as Record<string, unknown>,
        show,
        exclude,
        params.showOnly
      );
  return { data };
}
