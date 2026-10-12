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
import { archiveExperiment } from '../../core/experiments/archive.js';

export const archiveCommand = new Command('archive')
  .description('Archive or unarchive experiment(s). Reads IDs from stdin when piped.')
  .argument('[id]', 'experiment ID or name', parseExperimentIdOrName)
  .option('--unarchive', 'unarchive the experiment')
  .option('--note <text>', 'activity log note')
  .option('-i, --interactive', 'prompt for note interactively')
  .option('--pass-through', 'pass failed IDs through in pipe mode')
  .action(
    withErrorHandling(async (nameOrId: string | undefined, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const ids: string[] = nameOrId
        ? [nameOrId]
        : isStdinPiped()
          ? await readLinesFromStdin()
          : [];
      if (ids.length === 0) throw new Error('Provide an experiment ID or pipe IDs from stdin');
      const actionLabel = options.unarchive ? 'unarchived' : 'archived';

      const note = await resolveNote(
        options,
        options.unarchive ? 'unarchive' : 'archive',
        getDefaultType(),
        globalOptions.profile
      );

      let hasFailures = false;
      for (const idStr of ids) {
        try {
          const id = await client.resolveExperimentId(idStr);
          await archiveExperiment(client, { experimentId: id, unarchive: options.unarchive, note });
          printResult(globalOptions, { message: `✓ Experiment ${id} ${actionLabel}`, id });
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
