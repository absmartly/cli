import type { ExperimentTemplate } from './parser.js';
import type { APIClient } from '../api-client.js';
import { buildExperimentPayload, type BuildPayloadResult } from '../payload/builder.js';
import { resolveBySearch } from '../payload/search-resolver.js';

// Template content can be untrusted (the /mcp endpoint), and every distinct
// metric or owner name costs one search request.
const MAX_TEMPLATE_SEARCHES = 100;

export async function buildPayloadFromTemplate(
  client: APIClient,
  template: ExperimentTemplate,
  defaultType = 'test'
): Promise<BuildPayloadResult> {
  const metricNames = [
    template.primary_metric,
    ...(template.secondary_metrics ?? []),
    ...(template.guardrail_metrics ?? []),
    ...(template.exploratory_metrics ?? []),
  ].filter(Boolean) as string[];

  const ownerRefs = template.owners ?? [];

  const [applications, unitTypes, customSectionFields, metrics, users, teams, experimentTags] =
    await Promise.all([
      client.listApplications(),
      client.listUnitTypes(),
      client.listCustomSectionFields(),
      metricNames.length > 0
        ? resolveBySearch(
            metricNames,
            (name) => client.listMetrics({ search: name, archived: true }),
            { maxSearches: MAX_TEMPLATE_SEARCHES }
          )
        : Promise.resolve([]),
      ownerRefs.length > 0
        ? resolveBySearch(ownerRefs, (ref) => client.listUsers({ search: ref }), {
            maxSearches: MAX_TEMPLATE_SEARCHES,
          })
        : Promise.resolve([]),
      template.teams?.length ? client.listTeams() : Promise.resolve([]),
      template.tags?.length ? client.listExperimentTags() : Promise.resolve([]),
    ]);

  return buildExperimentPayload(
    template,
    {
      applications,
      unitTypes,
      metrics,
      goals: [],
      customSectionFields,
      users,
      teams,
      experimentTags,
    },
    defaultType
  );
}
