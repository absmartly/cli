import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { DryRunError } from '../../api-client/http-client.js';
import { parseExperimentIdOrName } from './resolve-id.js';
import { isStdinPiped, isStdoutPiped, readLinesFromStdin } from '../../lib/utils/stdin.js';
import { resolveNote } from './resolve-note.js';
import { getDefaultType } from './default-type.js';
import { startExperiment } from '../../core/experiments/start.js';

export const startCommand = new Command('start')
  .description('Start experiment(s). Reads IDs from stdin when piped.')
  .argument('[id]', 'experiment ID or name', parseExperimentIdOrName)
  .option('--note <text>', 'activity log note')
  .option('-i, --interactive', 'prompt for note interactively')
  .option('--pass-through', 'pass failed IDs through in pipe mode')
  .action(
    withErrorHandling(async (nameOrId: string | undefined, options) => {
      const globalOptions = getGlobalOptions(startCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const ids: string[] = nameOrId
        ? [nameOrId]
        : isStdinPiped()
          ? await readLinesFromStdin()
          : [];
      if (ids.length === 0) throw new Error('Provide an experiment ID or pipe IDs from stdin');

      const note = await resolveNote(options, 'start', getDefaultType(), globalOptions.profile);

      let hasFailures = false;
      for (const idStr of ids) {
        try {
          const id = await client.resolveExperimentId(idStr);
          const result = await startExperiment(client, { experimentId: id, note });
          if (result.data.skipped) {
            console.error(chalk.yellow(`⚠ Experiment ${id} is in draft state, skipping`));
            if (isStdoutPiped() && options.passThrough) console.log(id);
            continue;
          }
          printResult(globalOptions, { message: `✓ Experiment ${id} started`, id });
        } catch (e) {
          if (e instanceof DryRunError) {
            console.error(chalk.blue(`○ Experiment ${idStr}: ${e.message}`));
            continue;
          }
          hasFailures = true;
          if (isStdoutPiped() && options.passThrough) console.log(idStr);
          console.error(chalk.red(`✗ Experiment ${idStr}: ${e instanceof Error ? e.message : e}`));
        }
      }
      if (hasFailures) process.exitCode = 1;
    })
  );
