import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  resolveEndpoint,
  resolveAPIKey,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { runInteractiveEditor } from '../../lib/interactive/run.js';
import { parseExperimentId } from '../../lib/utils/validators.js';
import { getDefaultType } from './default-type.js';
import type { ExperimentId } from '../../lib/api/branded-types.js';
import { buildClonePayload, cloneExperiment } from '../../core/experiments/clone.js';

export const cloneCommand = new Command('clone')
  .description('Clone an experiment or feature flag')
  .argument('<id>', 'experiment ID to clone', parseExperimentId)
  .option('--name <name>', 'name for the cloned experiment (required)')
  .option('--display-name <name>', 'display name for the clone')
  .option('--state <state>', 'initial state (created, ready)', 'created')
  .option('--from-file <path>', 'apply template overrides before cloning')
  .option('-i, --interactive', 'interactive step-by-step editor')
  .action(
    withErrorHandling(async (id: ExperimentId, options) => {
      if (!options.name && !options.interactive) {
        throw new Error(
          `--name is required for clone.\n` +
            `Example: abs experiments clone ${id} --name my_cloned_experiment`
        );
      }

      const globalOptions = getGlobalOptions(cloneCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const apiEndpoint = resolveEndpoint(globalOptions);
      const experiment = await client.getExperiment(id);
      const hasScreenshots =
        ((experiment.variant_screenshots as unknown[] | undefined)?.length ?? 0) > 0;
      const apiKey = hasScreenshots ? await resolveAPIKey(globalOptions) : undefined;

      let { payload, warnings } = await buildClonePayload(client, {
        experimentId: id,
        name: options.name,
        displayName: options.displayName,
        state: options.state,
        overrideContent: options.fromFile
          ? readFileSync(options.fromFile === '-' ? '/dev/stdin' : options.fromFile, 'utf8')
          : undefined,
        defaultType: getDefaultType(),
        apiEndpoint,
        apiKey,
      });

      for (const warning of warnings) {
        console.log(chalk.yellow(`⚠ ${warning}`));
      }

      if (options.interactive) {
        const { buildPayloadFromTemplate } =
          await import('../../api-client/template/build-from-template.js');
        const edited = await runInteractiveEditor(
          client,
          payload as Record<string, unknown>,
          getDefaultType()
        );
        if (!edited) return;
        const result = await buildPayloadFromTemplate(client, edited, getDefaultType());
        for (const w of result.warnings) {
          console.log(chalk.yellow(`⚠ ${w}`));
        }
        payload = result.payload as Record<string, unknown>;
      }

      const result = await cloneExperiment(client, payload as Record<string, unknown>, id);
      console.error(chalk.green(`Experiment ${id} cloned → new ID: ${result.data.id}`));
      printFormatted(result.data, globalOptions);
    })
  );
