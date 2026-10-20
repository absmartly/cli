import { Command } from 'commander';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
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
import { stopExperiment, VALID_STOP_REASONS } from '../../core/experiments/stop.js';

export const stopCommand = new Command('stop')
  .description('Stop experiment(s). Reads IDs from stdin when piped.')
  .argument('[id]', 'experiment ID or name', parseExperimentIdOrName)
  .option('--reason <reason>', 'reason for stopping')
  .option('--note <text>', 'activity log note')
  .option('-i, --interactive', 'prompt for note and reason interactively')
  .option('--pass-through', 'pass failed IDs through in pipe mode')
  .action(
    withErrorHandling(async (nameOrId: string | undefined, options) => {
      const globalOptions = getGlobalOptions(stopCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const ids: string[] = nameOrId
        ? [nameOrId]
        : isStdinPiped()
          ? await readLinesFromStdin()
          : [];
      if (ids.length === 0) throw new Error('Provide an experiment ID or pipe IDs from stdin');

      const reason =
        options.reason ||
        (options.interactive
          ? await select({
              message: 'Reason for stopping',
              choices: VALID_STOP_REASONS.map((r) => ({ value: r, name: r.replace(/_/g, ' ') })),
            })
          : 'other');

      const note = await resolveNote(options, 'stop', getDefaultType(), globalOptions.profile);

      let hasFailures = false;
      for (const idStr of ids) {
        try {
          const id = await client.resolveExperimentId(idStr);
          await stopExperiment(client, { experimentId: id, reason, note });
          printResult(globalOptions, { message: `✓ Experiment ${id} stopped`, id });
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
