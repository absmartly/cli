import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { experimentToMarkdown } from '../../api-client/template/serializer.js';
import { parseExperimentMarkdown } from '../../api-client/template/parser.js';
import { buildPayloadFromTemplate } from '../../api-client/template/build-from-template.js';
import { readTemplateFile } from '../../lib/template/parser.js';
import { runInteractiveEditor } from '../../lib/interactive/run.js';
import { parseExperimentIdOrName } from './resolve-id.js';
import { getDefaultType } from './default-type.js';
import { registerCustomFieldOptions, extractCustomFieldValues } from './custom-field-options.js';
import { resolveNote } from './resolve-note.js';
import { buildUpdateChanges, updateExperiment } from '../../core/experiments/update.js';

export const updateCommand = new Command('update')
  .description('Update an existing experiment')
  .argument('<id>', 'experiment ID or name', parseExperimentIdOrName)
  .option('--from-file <path>', 'update from markdown template file')
  .option('--name <name>', 'experiment name')
  .option('--display-name <name>', 'new display name')
  .option('--state <state>', 'experiment state (created, ready, running)')
  .option('--variants <names>', 'comma-separated variant names')
  .option('--variant-config <json...>', 'variant config JSON (one per variant, in order)')
  .option('--application-id <id>', 'application ID', parseInt)
  .option('--unit-type <id>', 'unit type ID', parseInt)
  .option('--primary-metric <id>', 'primary metric ID', parseInt)
  .option('--secondary-metrics <names>', 'comma-separated secondary metric names or IDs')
  .option('--guardrail-metrics <names>', 'comma-separated guardrail metric names or IDs')
  .option('--exploratory-metrics <names>', 'comma-separated exploratory metric names or IDs')
  .option('--percentages <values>', 'comma-separated traffic split per variant (e.g. 50,50)')
  .option('--percentage-of-traffic <pct>', 'percentage of total traffic (0-100)', parseInt)
  .option(
    '--owner <user_id>',
    'owner user ID (can specify multiple)',
    (val: string, prev: string[]) => [...prev, val],
    [] as string[]
  )
  .option(
    '--screenshot <variant:source...>',
    'variant screenshot (variant_index:path_or_url, can specify multiple)'
  )
  .option(
    '--screenshot-id <variant:upload_id...>',
    'variant screenshot by existing file upload ID (variant_index:upload_id, can specify multiple)'
  )
  .option('--teams <names>', 'comma-separated team names or IDs')
  .option('--tags <names>', 'comma-separated tag names or IDs')
  .option('--audience <json>', 'audience filter JSON')
  .option('--analysis-type <type>', 'analysis type (group_sequential, fixed_horizon)')
  .option('--required-alpha <value>', 'required alpha (significance level)')
  .option('--required-power <value>', 'required power')
  .option('--baseline-participants <n>', 'baseline participants per day');

registerCustomFieldOptions(updateCommand, getDefaultType());

updateCommand
  .option('--note <text>', 'activity log note')
  .option('-i, --interactive', 'interactive step-by-step editor');

updateCommand.action(
  withErrorHandling(async (nameOrId: string, options) => {
    const globalOptions = getGlobalOptions(updateCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const id = await client.resolveExperimentId(nameOrId);

    const { changes, warnings } = await buildUpdateChanges(client, {
      experimentId: id,
      name: options.name,
      displayName: options.displayName,
      state: options.state,
      percentageOfTraffic: options.percentageOfTraffic,
      percentages: options.percentages,
      analysisType: options.analysisType,
      requiredAlpha: options.requiredAlpha,
      requiredPower: options.requiredPower,
      baselineParticipants: options.baselineParticipants,
      audience: options.audience,
      primaryMetric: options.primaryMetric,
      unitType: options.unitType,
      applicationId: options.applicationId,
      owner: options.owner,
      variants: options.variants,
      variantConfig: options.variantConfig,
      secondaryMetrics: options.secondaryMetrics,
      guardrailMetrics: options.guardrailMetrics,
      exploratoryMetrics: options.exploratoryMetrics,
      teams: options.teams,
      tags: options.tags,
      screenshot: options.screenshot,
      screenshotId: options.screenshotId,
      customFieldValues: extractCustomFieldValues(
        options,
        getDefaultType(),
        globalOptions.profile as string
      ),
      templateContent: options.fromFile ? readTemplateFile(options.fromFile) : undefined,
      defaultType: getDefaultType(),
    });

    for (const warning of warnings) {
      console.log(chalk.yellow(`⚠ ${warning}`));
    }

    if (options.interactive) {
      const experiment = await client.getExperiment(id);
      const md = await experimentToMarkdown(experiment);
      const template = parseExperimentMarkdown(md);
      const edited = await runInteractiveEditor(client, template, getDefaultType());
      if (!edited) return;
      const resolved = await buildPayloadFromTemplate(client, edited, getDefaultType());
      for (const warning of resolved.warnings) console.log(chalk.yellow(`⚠ ${warning}`));
      for (const [key, value] of Object.entries(resolved.payload)) {
        changes[key] = value;
      }
    }

    const note = await resolveNote(options, 'update', getDefaultType(), globalOptions.profile);

    await updateExperiment(client, { experimentId: id, changes, note });
    printResult(globalOptions, { message: `Experiment ${id} updated`, id });
  })
);
