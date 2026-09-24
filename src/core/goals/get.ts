import type { APIClient } from '../../api-client/api-client.js';
import type { GoalId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';
import { applyShowExclude, summarizeGoal } from '../../api-client/entity-summary.js';

export interface GetGoalParams {
  id: GoalId;
  show?: string[] | undefined;
  exclude?: string[] | undefined;
  showOnly?: string[] | undefined;
  raw?: boolean | undefined;
}

export async function getGoal(
  client: APIClient,
  params: GetGoalParams
): Promise<CommandResult<unknown>> {
  const goal = await client.getGoal(params.id);
  const show = params.show ?? [];
  const exclude = params.exclude ?? [];

  const data = params.raw
    ? goal
    : applyShowExclude(
        summarizeGoal(goal as Record<string, unknown>),
        goal as Record<string, unknown>,
        show,
        exclude,
        params.showOnly
      );
  return { data };
}
