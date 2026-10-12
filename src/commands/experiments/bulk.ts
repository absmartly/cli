import { Command } from 'commander';
import chalk from 'chalk';
import { select, confirm } from '@inquirer/prompts';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import type { ExperimentId } from '../../lib/api/branded-types.js';
import { parseExperimentId } from '../../lib/utils/validators.js';
import { isStdinPiped, readLinesFromStdin } from '../../lib/utils/stdin.js';
import {
  collectBulkIds,
  fetchBulkNames,
  bulkStart,
  bulkStop,
  bulkArchive,
  bulkDevelopment,
  bulkFullOn,
  type BulkResult,
} from '../../core/experiments/bulk.js';
import { VALID_STOP_REASONS } from '../../core/experiments/stop.js';

async function readStdinIds(): Promise<ExperimentId[]> {
  const lines = await readLinesFromStdin();
  return lines.map((line) => parseExperimentId(line));
}

function printResults(results: BulkResult[], actionLabel: string) {
  const succeeded = results.filter((r) => r.success && !r.dryRun);
  const dryRun = results.filter((r) => r.dryRun);
  const failed = results.filter((r) => !r.success);

  for (const r of dryRun) {
    console.error(chalk.blue(`  ○ ${r.name} (${r.id}) — would be ${actionLabel} (dry run)`));
  }
  for (const r of succeeded) {
    console.log(chalk.green(`  ✓ ${r.name} (${r.id}) — ${actionLabel}`));
  }
  for (const r of failed) {
    console.log(chalk.red(`  ✗ ${r.name} (${r.id}) — ${r.error}`));
  }

  const parts: string[] = [];
  if (succeeded.length > 0 || dryRun.length === 0) parts.push(`${succeeded.length} succeeded`);
  if (dryRun.length > 0) parts.push(`${dryRun.length} previewed (dry run)`);
  parts.push(`${failed.length} failed`);
  const summary = `${chalk.bold('Results:')} ${parts.join(', ')} out of ${results.length}`;
  // A run made only of dry-run previews has nothing for stdout: keep it clean.
  const log = results.length > 0 && dryRun.length === results.length ? console.error : console.log;
  log('');
  log(summary);
  if (failed.length > 0) process.exitCode = 1;
}

function showSummary(
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  actionLabel: string,
  dryRun = false
) {
  // Under --dry-run the whole report is a preview, so it goes to stderr.
  const log = dryRun ? console.error : console.log;
  log(chalk.bold(`\nBulk ${actionLabel} — ${ids.length} experiment(s):\n`));
  for (const id of ids) {
    const name = names.get(id) ?? `#${id}`;
    log(`  - ${name} (${id})`);
  }
  log('');
}

interface BulkOptions {
  note?: string;
  stdin?: boolean;
  state?: string;
  app?: string;
  yes?: boolean;
}

function addSharedOptions(cmd: Command): Command {
  return cmd
    .option('--note <text>', 'activity log note')
    .option('--stdin', 'read experiment IDs from stdin (one per line)')
    .option('--state <state>', 'filter experiments by state')
    .option('--app <name>', 'filter experiments by application')
    .option('--yes', 'skip confirmation prompt');
}

const bulkStartCommand = addSharedOptions(
  new Command('start')
    .description('Start multiple experiments')
    .argument('[ids...]', 'experiment IDs')
);

bulkStartCommand.action(
  withErrorHandling(async (rawIds: string[], options: BulkOptions) => {
    const globalOptions = getGlobalOptions(bulkStartCommand);
    const client = await getAPIClientFromOptions(globalOptions);

    const stdinIds =
      options.stdin || (isStdinPiped() && rawIds.length === 0) ? await readStdinIds() : undefined;
    const ids = await collectBulkIds(client, rawIds, { ...options, stdinIds });
    if (ids.length === 0) {
      console.log('No experiments matched.');
      return;
    }

    const names = await fetchBulkNames(client, ids);
    showSummary(ids, names, 'start', globalOptions.dryRun);

    if (!globalOptions.dryRun && !options.yes) {
      const proceed = await confirm({
        message: `Start ${ids.length} experiment(s)?`,
        default: false,
      });
      if (!proceed) return;
    }

    const result = await bulkStart(client, ids, names, options.note);
    printResults(result.data.results, 'started');
    if (result.warnings?.length) {
      for (const w of result.warnings) console.log(chalk.yellow(`\n⚠ ${w}`));
    }
  })
);

const bulkStopCommand = addSharedOptions(
  new Command('stop')
    .description('Stop multiple experiments')
    .argument('[ids...]', 'experiment IDs')
    .option('--reason <reason>', 'reason for stopping')
);

bulkStopCommand.action(
  withErrorHandling(async (rawIds: string[], options: BulkOptions & { reason?: string }) => {
    const globalOptions = getGlobalOptions(bulkStopCommand);
    const client = await getAPIClientFromOptions(globalOptions);

    const stdinIds =
      options.stdin || (isStdinPiped() && rawIds.length === 0) ? await readStdinIds() : undefined;
    const ids = await collectBulkIds(client, rawIds, { ...options, stdinIds });
    if (ids.length === 0) {
      console.log('No experiments matched.');
      return;
    }

    const names = await fetchBulkNames(client, ids);
    showSummary(ids, names, 'stop', globalOptions.dryRun);

    if (options.reason && !(VALID_STOP_REASONS as readonly string[]).includes(options.reason)) {
      throw new Error(
        `Invalid stop reason: "${options.reason}"\n` +
          `Valid reasons: ${VALID_STOP_REASONS.join(', ')}`
      );
    }

    const reason =
      options.reason ||
      (await select({
        message: 'Reason for stopping',
        choices: VALID_STOP_REASONS.map((r) => ({ value: r, name: r.replace(/_/g, ' ') })),
      }));

    if (!globalOptions.dryRun && !options.yes) {
      const proceed = await confirm({
        message: `Stop ${ids.length} experiment(s) (reason: ${reason})?`,
        default: false,
      });
      if (!proceed) return;
    }

    const result = await bulkStop(client, ids, names, reason, options.note);
    printResults(result.data.results, 'stopped');
    if (result.warnings?.length) {
      for (const w of result.warnings) console.log(chalk.yellow(`\n⚠ ${w}`));
    }
  })
);

const bulkArchiveCommand = addSharedOptions(
  new Command('archive')
    .description('Archive multiple experiments')
    .argument('[ids...]', 'experiment IDs')
);

bulkArchiveCommand.action(
  withErrorHandling(async (rawIds: string[], options: BulkOptions) => {
    const globalOptions = getGlobalOptions(bulkArchiveCommand);
    const client = await getAPIClientFromOptions(globalOptions);

    const stdinIds =
      options.stdin || (isStdinPiped() && rawIds.length === 0) ? await readStdinIds() : undefined;
    const ids = await collectBulkIds(client, rawIds, { ...options, stdinIds });
    if (ids.length === 0) {
      console.log('No experiments matched.');
      return;
    }

    const names = await fetchBulkNames(client, ids);
    showSummary(ids, names, 'archive', globalOptions.dryRun);

    if (!globalOptions.dryRun && !options.yes) {
      const proceed = await confirm({
        message: `Archive ${ids.length} experiment(s)?`,
        default: false,
      });
      if (!proceed) return;
    }

    const result = await bulkArchive(client, ids, names, options.note);
    printResults(result.data.results, 'archived');
    if (result.warnings?.length) {
      for (const w of result.warnings) console.log(chalk.yellow(`\n⚠ ${w}`));
    }
  })
);

const bulkDevelopmentCommand = addSharedOptions(
  new Command('development')
    .alias('dev')
    .description('Put multiple experiments into development mode')
    .argument('[ids...]', 'experiment IDs')
);

bulkDevelopmentCommand.action(
  withErrorHandling(async (rawIds: string[], options: BulkOptions) => {
    const globalOptions = getGlobalOptions(bulkDevelopmentCommand);
    const client = await getAPIClientFromOptions(globalOptions);

    const stdinIds =
      options.stdin || (isStdinPiped() && rawIds.length === 0) ? await readStdinIds() : undefined;
    const ids = await collectBulkIds(client, rawIds, { ...options, stdinIds });
    if (ids.length === 0) {
      console.log('No experiments matched.');
      return;
    }

    const names = await fetchBulkNames(client, ids);
    showSummary(ids, names, 'development', globalOptions.dryRun);

    if (!globalOptions.dryRun && !options.yes) {
      const proceed = await confirm({
        message: `Set ${ids.length} experiment(s) to development?`,
        default: false,
      });
      if (!proceed) return;
    }

    const result = await bulkDevelopment(client, ids, names, options.note);
    printResults(result.data.results, 'set to development');
    if (result.warnings?.length) {
      for (const w of result.warnings) console.log(chalk.yellow(`\n⚠ ${w}`));
    }
  })
);

const bulkFullOnCommand = addSharedOptions(
  new Command('full-on')
    .description('Set multiple experiments to full-on mode')
    .argument('[ids...]', 'experiment IDs')
    .option('--variant <number>', 'variant number (>= 1)', (v) => {
      const num = parseInt(v, 10);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error(`Invalid variant: "${v}" must be an integer >= 1`);
      }
      return num;
    })
);

bulkFullOnCommand.action(
  withErrorHandling(async (rawIds: string[], options: BulkOptions & { variant?: number }) => {
    const globalOptions = getGlobalOptions(bulkFullOnCommand);
    const client = await getAPIClientFromOptions(globalOptions);

    const stdinIds =
      options.stdin || (isStdinPiped() && rawIds.length === 0) ? await readStdinIds() : undefined;
    const ids = await collectBulkIds(client, rawIds, { ...options, stdinIds });
    if (ids.length === 0) {
      console.log('No experiments matched.');
      return;
    }

    const names = await fetchBulkNames(client, ids);
    showSummary(ids, names, 'full-on', globalOptions.dryRun);

    const variant =
      options.variant ??
      (await select({
        message: 'Select variant for full-on',
        choices: [1, 2, 3, 4, 5].map((n) => ({ value: n, name: `Variant ${n}` })),
      }));

    if (!globalOptions.dryRun && !options.yes) {
      const proceed = await confirm({
        message: `Set ${ids.length} experiment(s) to full-on (variant ${variant})?`,
        default: false,
      });
      if (!proceed) return;
    }

    const result = await bulkFullOn(client, ids, names, variant, options.note);
    printResults(result.data.results, `set to full-on (variant ${variant})`);
    if (result.warnings?.length) {
      for (const w of result.warnings) console.log(chalk.yellow(`\n⚠ ${w}`));
    }
  })
);

export const bulkCommand = new Command('bulk').description('Bulk operations on experiments');

for (const cmd of [
  bulkStartCommand,
  bulkStopCommand,
  bulkArchiveCommand,
  bulkDevelopmentCommand,
  bulkFullOnCommand,
]) {
  bulkCommand.addCommand(cmd);
}
