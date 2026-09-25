import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  addFieldProjectionHelp,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseMetricId } from '../../lib/utils/validators.js';
import type { MetricId } from '../../lib/api/branded-types.js';
import {
  applyShowExclude,
  summarizeMetric,
  summarizeMetricRow,
} from '../../api-client/entity-summary.js';
import { createListCommand } from '../../lib/utils/list-command.js';
import { listMetrics as coreListMetrics, listAllMetrics } from '../../core/metrics/list.js';
import {
  parseMetricFilters,
  validateMetricFilters,
  hasActiveMetricFilters,
  filterMetrics,
} from '../../core/metrics/filter.js';
import { getMetric } from '../../core/metrics/get.js';
import { createMetric } from '../../core/metrics/create.js';
import { updateMetric } from '../../core/metrics/update.js';
import { archiveMetric } from '../../core/metrics/archive.js';
import { activateMetric } from '../../core/metrics/activate.js';
import { createMetricVersion } from '../../core/metrics/new-version.js';
import type { MetricFields } from '../../core/metrics/payload.js';
import { resolveGoalId } from '../../core/resolve.js';
import { accessCommand } from './access.js';
import { reviewCommand } from './review.js';
import { followCommand, unfollowCommand } from './follow.js';

export const metricsCommand = new Command('metrics').alias('metric').description('Metric commands');

const listCommand = createListCommand({
  description: 'List all metrics',
  defaultItems: 100,
  fetch: async (client, options) => {
    const baseParams = {
      items: options.items as number,
      page: options.page as number,
      archived: options.archived as boolean,
      include_drafts: options.includeDrafts as boolean,
      search: options.search as string | undefined,
      sort: options.sort as string | undefined,
      sortAsc: options.asc ? true : options.desc ? false : undefined,
      ids: options.ids as string | undefined,
      owners: options.owners as string | undefined,
      teams: options.teams as string | undefined,
      reviewStatus: options.reviewStatus as string | undefined,
    };

    const filters = parseMetricFilters(options);
    if (hasActiveMetricFilters(filters)) {
      validateMetricFilters(options, filters);
      // Client-side filters need the full set, not a single page.
      const all = await listAllMetrics(client, baseParams);
      return filterMetrics(all.data as Array<Record<string, unknown>>, filters);
    }

    const result = await coreListMetrics(client, baseParams);
    return result.data;
  },
  summarizeRow: summarizeMetricRow,
  isClientFiltered: (options) => hasActiveMetricFilters(parseMetricFilters(options)),
  extraOptions: (cmd) =>
    cmd
      .option('--include-drafts', 'include draft (non-activated) metrics')
      .option('--owners <values>', 'filter by owners (comma-separated IDs, names, or emails)')
      .option('--teams <values>', 'filter by teams (comma-separated IDs or names)')
      .option('--review-status <status>', 'filter by review status (pending, approved, none)')
      // Client-side filters (applied across all pages). API-side equivalents are a follow-up.
      .option(
        '--metric-type <values>',
        'filter by metric type(s), comma-separated (goal_count, goal_unique_count, goal_time_to_achievement, goal_property, goal_property_unique_count, goal_ratio, goal_retention, goal_activity_period_count, custom_sql)'
      )
      .option(
        '--goal <values>',
        'filter by goal name or ID, comma-separated (matches numerator and denominator goals)'
      )
      // positive flag declared before negative so the boolean stays tri-state
      .option(
        '--outlier-limiting',
        'only metrics that have outlier limiting (method other than unlimited)'
      )
      .option('--no-outlier-limiting', 'only metrics without outlier limiting')
      .option(
        '--outlier-method <values>',
        'filter by outlier limit method(s), comma-separated (unlimited, quantile, stdev, fixed)'
      )
      .option('--has-property-filter', 'only metrics that have a goal property filter')
      .option('--no-property-filter', 'only metrics without a goal property filter')
      .option(
        '--property-filter-path <values>',
        'filter by property path(s) referenced in the property filter, comma-separated (substring match)'
      )
      .option(
        '--property-filter-contains <text>',
        'filter by a substring anywhere in the serialized property filter'
      )
      .option(
        '--impact-direction <values>',
        'filter by impact direction(s), comma-separated (positive, negative, unknown)'
      )
      .option('--cuped', 'only metrics with CUPED (variance reduction) enabled')
      .option('--no-cuped', 'only metrics without CUPED'),
});

const getCommand = new Command('get')
  .description('Get metric details')
  .argument('<id>', 'metric ID', parseMetricId)
  .action(
    withErrorHandling(async (id: MetricId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const { show = [], exclude = [], showOnly } = globalOptions;

      const result = await getMetric(client, { id });
      const data = globalOptions.raw
        ? result.data
        : applyShowExclude(
            summarizeMetric(result.data as Record<string, unknown>),
            result.data as Record<string, unknown>,
            show,
            exclude,
            showOnly
          );
      printFormatted(data, globalOptions);
    })
  );

function parseJsonOption(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
}

function addMetricFieldOptions(cmd: Command): Command {
  return (
    cmd
      .option('--name <name>', 'metric name')
      .option(
        '--type <type>',
        'metric type (goal_count, goal_unique_count, goal_time_to_achievement, goal_property, goal_property_unique_count, goal_ratio, goal_retention, goal_activity_period_count, custom_sql)'
      )
      .option('--description <text>', 'metric description')
      .option('--effect <effect>', 'expected effect direction (positive, negative, unknown)')
      .option('--goal <name-or-id>', 'goal name or ID (required for goal_* types)')
      .option('--goal-id <id>', 'goal ID (deprecated, use --goal instead)', parseInt)
      .option('--owner <user_id>', 'owner user ID', parseInt)
      .option('--format-str <str>', 'display format string')
      .option('--scale <n>', 'display scale', parseInt)
      .option('--precision <n>', 'display precision', parseInt)
      .option('--mean-format-str <str>', 'mean display format string')
      .option('--mean-scale <n>', 'mean display scale', parseInt)
      .option('--mean-precision <n>', 'mean display precision', parseInt)
      .option(
        '--outlier-limit-method <method>',
        'outlier limit method (unlimited, quantile, stdev, fixed)'
      )
      .option(
        '--value-source-property <property>',
        'value source property (required for goal_property type)'
      )
      .option('--property-filter <json>', 'property filter (JSON)', parseJsonOption)
      .option('--retention-time <duration>', 'retention time (required for goal_retention type)')
      .option(
        '--retention-time-reference <ref>',
        'retention time reference (first_exposure, first_achievement)'
      )
      .option(
        '--activity-interval <interval>',
        'activity interval (required for goal_activity_period_count type)'
      )
      .option('--custom-sql <sql>', 'custom SQL (required for custom_sql type)')
      .option('--custom-statistics-type <type>', 'custom statistics type (continuous, binomial)')
      .option(
        '--datasource-id <id>',
        'datasource ID the custom SQL runs against (custom_sql)',
        parseInt
      )
      .option('--vr-lookback-interval <interval>', 'VR lookback interval (1w, 2w, 3w, 4w)')
      .option('--relation-kind <kind>', 'goal relation kind (refund, replacement)')
      .option('--relation-refund-operation <op>', 'refund operation (add, subtract)')
      .option(
        '--relation-foreign-duplicate-operation <op>',
        'foreign duplicate operation (first, last, sum, min, max)'
      )
      // goal_ratio-specific fields
      .option(
        '--numerator-type <type>',
        'numerator type (required for goal_ratio, same values as --type)'
      )
      .option(
        '--denominator-type <type>',
        'denominator type (required for goal_ratio, same values as --type)'
      )
      .option(
        '--denominator-outlier-limit-method <method>',
        'denominator outlier limit method (required for goal_ratio; unlimited, quantile, stdev, fixed)'
      )
      .option('--denominator-goal <name-or-id>', 'denominator goal name or ID (goal_ratio)')
      .option('--denominator-value-source-property <property>', 'denominator value source property')
      .option(
        '--denominator-property-filter <json>',
        'denominator property filter (JSON)',
        parseJsonOption
      )
      .option('--denominator-retention-time <duration>', 'denominator retention time')
      .option(
        '--denominator-retention-time-reference <ref>',
        'denominator retention time reference (first_exposure, first_achievement)'
      )
      .option('--denominator-activity-interval <interval>', 'denominator activity interval')
      .option('--denominator-custom-sql <sql>', 'denominator custom SQL')
      .option(
        '--denominator-custom-statistics-type <type>',
        'denominator custom statistics type (continuous, binomial)'
      )
      .option(
        '--denominator-vr-lookback-interval <interval>',
        'denominator VR lookback interval (1w, 2w, 3w, 4w)'
      )
      .option(
        '--denominator-relation-kind <kind>',
        'denominator relation kind (refund, replacement)'
      )
      .option(
        '--denominator-relation-refund-operation <op>',
        'denominator refund operation (add, subtract)'
      )
      .option(
        '--denominator-relation-foreign-duplicate-operation <op>',
        'denominator foreign duplicate operation (first, last, sum, min, max)'
      )
      .option('--ratio-condition <condition>', 'ratio condition (require_denominator)')
  );
}

async function resolveMetricFieldsFromOptions(
  client: Awaited<ReturnType<typeof getAPIClientFromOptions>>,
  options: Record<string, unknown>
): Promise<MetricFields> {
  const goalRef = (options.goal as string | undefined) ?? options.goalId;
  const goalId = goalRef != null ? await resolveGoalId(client, String(goalRef)) : undefined;
  const denominatorGoalRef = options.denominatorGoal as string | undefined;
  const denominatorGoalId =
    denominatorGoalRef != null
      ? await resolveGoalId(client, String(denominatorGoalRef))
      : undefined;

  return {
    name: options.name as string | undefined,
    type: options.type as string | undefined,
    description: options.description as string | undefined,
    effect: options.effect as string | undefined,
    goalId,
    owner: options.owner as number | undefined,
    formatStr: options.formatStr as string | undefined,
    scale: options.scale as number | undefined,
    precision: options.precision as number | undefined,
    meanFormatStr: options.meanFormatStr as string | undefined,
    meanScale: options.meanScale as number | undefined,
    meanPrecision: options.meanPrecision as number | undefined,
    outlierLimitMethod: options.outlierLimitMethod as string | undefined,
    valueSourceProperty: options.valueSourceProperty as string | undefined,
    propertyFilter: options.propertyFilter,
    retentionTime: options.retentionTime as string | undefined,
    retentionTimeReference: options.retentionTimeReference as string | undefined,
    activityInterval: options.activityInterval as string | undefined,
    customSql: options.customSql as string | undefined,
    customStatisticsType: options.customStatisticsType as string | undefined,
    datasourceId: options.datasourceId as number | undefined,
    vrLookbackInterval: options.vrLookbackInterval as string | undefined,
    relationKind: options.relationKind as string | undefined,
    relationRefundOperation: options.relationRefundOperation as string | undefined,
    relationForeignDuplicateOperation: options.relationForeignDuplicateOperation as
      | string
      | undefined,
    numeratorType: options.numeratorType as string | undefined,
    denominatorType: options.denominatorType as string | undefined,
    denominatorGoalId,
    denominatorValueSourceProperty: options.denominatorValueSourceProperty as string | undefined,
    denominatorPropertyFilter: options.denominatorPropertyFilter,
    denominatorOutlierLimitMethod: options.denominatorOutlierLimitMethod as string | undefined,
    denominatorRetentionTime: options.denominatorRetentionTime as string | undefined,
    denominatorRetentionTimeReference: options.denominatorRetentionTimeReference as
      | string
      | undefined,
    denominatorActivityInterval: options.denominatorActivityInterval as string | undefined,
    denominatorCustomSql: options.denominatorCustomSql as string | undefined,
    denominatorCustomStatisticsType: options.denominatorCustomStatisticsType as string | undefined,
    denominatorVrLookbackInterval: options.denominatorVrLookbackInterval as string | undefined,
    denominatorRelationKind: options.denominatorRelationKind as string | undefined,
    denominatorRelationRefundOperation: options.denominatorRelationRefundOperation as
      | string
      | undefined,
    denominatorRelationForeignDuplicateOperation:
      options.denominatorRelationForeignDuplicateOperation as string | undefined,
    ratioCondition: options.ratioCondition as string | undefined,
  };
}

const createCommand = addMetricFieldOptions(
  new Command('create').description(
    'Create a new metric (or a new version of an existing metric with --new-version)'
  )
)
  .option('--activate', 'activate the metric immediately after creation')
  .option(
    '--new-version <id>',
    'create a new draft version of metric <id> instead of a fresh metric (requires --reason)',
    parseMetricId as (v: string) => MetricId
  )
  .option('--reason <text>', 'reason note (required with --new-version)')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const fields = await resolveMetricFieldsFromOptions(
        client,
        options as Record<string, unknown>
      );

      if (options.newVersion !== undefined) {
        if (!options.reason) {
          throw new Error('--reason is required when using --new-version');
        }
        const versionResult = await createMetricVersion(client, {
          id: options.newVersion as MetricId,
          reason: options.reason,
          ...fields,
        });
        const newId = versionResult.data.id;
        if (options.activate) {
          await client.activateMetric(newId as MetricId, options.reason);
          printResult(globalOptions, {
            message: `✓ New metric version created and activated (id: ${newId})`,
            id: newId,
            raw: versionResult.data,
          });
        } else {
          printResult(globalOptions, {
            message: `✓ New metric version created as draft (id: ${newId})`,
            id: newId,
            raw: versionResult.data,
          });
        }
        return;
      }

      const missing: string[] = [];
      if (!options.name) missing.push('--name');
      if (!options.type) missing.push('--type');
      if (!options.description) missing.push('--description');
      if (missing.length > 0) {
        throw new Error(
          `Missing required option${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`
        );
      }

      const result = await createMetric(client, {
        ...fields,
        name: options.name,
        type: options.type,
        description: options.description,
        effect: fields.effect ?? 'positive',
        formatStr: fields.formatStr ?? '{}',
        scale: fields.scale ?? 1,
        precision: fields.precision ?? 2,
        meanFormatStr: fields.meanFormatStr ?? '{}%',
        meanScale: fields.meanScale ?? 100,
        meanPrecision: fields.meanPrecision ?? 2,
        outlierLimitMethod: fields.outlierLimitMethod ?? 'unlimited',
      });

      if (options.activate) {
        await client.activateMetric(result.data.id as MetricId, 'Initial activation');
        printResult(globalOptions, {
          message: `✓ Metric created and activated with ID: ${result.data.id}`,
          id: result.data.id,
          raw: result.data,
        });
      } else {
        printResult(globalOptions, {
          message: `✓ Metric created with ID: ${result.data.id}`,
          id: result.data.id,
          raw: result.data,
        });
      }
    })
  );

const updateCommand = new Command('update')
  .description(
    'Update in-place editable fields of a metric (name, description, owner). For version-level changes (type, goal, format, etc.) use `metric version`.'
  )
  .argument('<id>', 'metric ID', parseMetricId)
  .option('--name <name>', 'new name')
  .option('--description <text>', 'new description')
  .option('--owner <user_id>', 'new owner user ID', parseInt)
  .action(
    withErrorHandling(async (id: MetricId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await updateMetric(client, {
        id,
        name: options.name,
        description: options.description,
        owner: options.owner,
      });
      printResult(globalOptions, { message: `✓ Metric ${id} updated`, id });
    })
  );

const archiveCommand = new Command('archive')
  .description('Archive or unarchive a metric')
  .argument('<id>', 'metric ID', parseMetricId)
  .option('--unarchive', 'unarchive the metric')
  .action(
    withErrorHandling(async (id: MetricId, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await archiveMetric(client, { id, unarchive: options.unarchive });
      const action = options.unarchive ? 'unarchived' : 'archived';
      printResult(globalOptions, { message: `✓ Metric ${id} ${action}`, id });
    })
  );

const activateCommand = new Command('activate')
  .description('Activate a metric version')
  .argument('<id>', 'metric ID', parseMetricId)
  .requiredOption('--reason <text>', 'reason for activation')
  .action(
    withErrorHandling(async (id: MetricId, options) => {
      const globalOptions = getGlobalOptions(activateCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await activateMetric(client, { id, reason: options.reason });
      printResult(globalOptions, { message: `✓ Metric ${id} activated`, id });
    })
  );

const versionCommand = addMetricFieldOptions(
  new Command('version')
    .alias('new-version')
    .description(
      'Create a new draft version of a metric with changed version-level fields (type, goal, format, etc.). Fields not provided are inherited from the current version.'
    )
    .argument('<id>', 'metric ID', parseMetricId)
    .requiredOption('--reason <text>', 'reason note for the new version')
)
  .option('--activate', 'activate the new version immediately after creation')
  .action(
    withErrorHandling(async (id: MetricId, options) => {
      const globalOptions = getGlobalOptions(versionCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const fields = await resolveMetricFieldsFromOptions(
        client,
        options as Record<string, unknown>
      );

      const result = await createMetricVersion(client, {
        id,
        reason: options.reason,
        ...fields,
      });

      const newId = result.data.id;
      if (options.activate) {
        await client.activateMetric(newId as MetricId, options.reason);
        printResult(globalOptions, {
          message: `✓ New version of metric ${id} created and activated (new id: ${newId})`,
          id: newId,
          raw: result.data,
        });
      } else {
        printResult(globalOptions, {
          message: `✓ New draft version of metric ${id} created (new id: ${newId})`,
          id: newId,
          raw: result.data,
        });
      }
    })
  );

metricsCommand.addCommand(listCommand);
metricsCommand.addCommand(addFieldProjectionHelp(getCommand));
metricsCommand.addCommand(createCommand);
metricsCommand.addCommand(updateCommand);
metricsCommand.addCommand(archiveCommand);
metricsCommand.addCommand(activateCommand);
metricsCommand.addCommand(versionCommand);
metricsCommand.addCommand(accessCommand);
metricsCommand.addCommand(reviewCommand);
metricsCommand.addCommand(followCommand);
metricsCommand.addCommand(unfollowCommand);
