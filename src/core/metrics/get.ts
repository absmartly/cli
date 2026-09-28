import type { APIClient } from '../../api-client/api-client.js';
import type { MetricId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';
import { applyShowExclude, summarizeMetric } from '../../api-client/entity-summary.js';

export interface GetMetricParams {
  id: MetricId;
  show?: string[] | undefined;
  exclude?: string[] | undefined;
  showOnly?: string[] | undefined;
  raw?: boolean | undefined;
}

export async function getMetric(
  client: APIClient,
  params: GetMetricParams
): Promise<CommandResult<unknown>> {
  const metric = await client.getMetric(params.id);
  const show = params.show ?? [];
  const exclude = params.exclude ?? [];

  const data = params.raw
    ? metric
    : applyShowExclude(
        summarizeMetric(metric as Record<string, unknown>),
        metric as Record<string, unknown>,
        show,
        exclude,
        params.showOnly
      );
  return { data };
}
