#!/usr/bin/env node

import { Command } from 'commander';
import { version } from './lib/utils/version.js';
import { experimentsCommand } from './commands/experiments/index.js';
import { authCommand } from './commands/auth/index.js';
import { configCommand } from './commands/config/index.js';
import { versionCommand } from './commands/version/index.js';
import { appsCommand } from './commands/apps/index.js';
import { envsCommand } from './commands/envs/index.js';
import { unitsCommand } from './commands/units/index.js';
import { goalsCommand } from './commands/goals/index.js';
import { segmentsCommand } from './commands/segments/index.js';
import { teamsCommand } from './commands/teams/index.js';
import { usersCommand } from './commands/users/index.js';
import { metricsCommand } from './commands/metrics/index.js';
import { apiCommand } from './commands/api/index.js';
import { openCommand } from './commands/open/index.js';
import { doctorCommand } from './commands/doctor/index.js';
import { createCompletionCommand } from './commands/completion/index.js';
import { tagsCommand } from './commands/tags/index.js';
import { goalTagsCommand } from './commands/goaltags/index.js';
import { metricTagsCommand } from './commands/metrictags/index.js';
import { metricCategoriesCommand } from './commands/metriccategories/index.js';
import { rolesCommand } from './commands/roles/index.js';
import { permissionsCommand } from './commands/permissions/index.js';
import { apiKeysCommand } from './commands/apikeys/index.js';
import { webhooksCommand } from './commands/webhooks/index.js';
import { setupCommand } from './commands/setup/index.js';
import { assetRolesCommand } from './commands/assetroles/index.js';
import { favoritesCommand } from './commands/favorites/index.js';
import { notificationsCommand } from './commands/notifications/index.js';
import { insightsCommand } from './commands/insights/index.js';
import { platformConfigCommand } from './commands/platformconfig/index.js';
import { corsCommand } from './commands/cors/index.js';
import { datasourcesCommand } from './commands/datasources/index.js';
import { exportConfigsCommand } from './commands/exportconfigs/index.js';
import { updateSchedulesCommand } from './commands/updateschedules/index.js';
import { customSectionsCommand } from './commands/customsections/index.js';
import { eventsCommand } from './commands/events/index.js';
import { storageConfigsCommand } from './commands/storageconfigs/index.js';
import { statisticsCommand } from './commands/statistics/index.js';
import { actionDialogFieldsCommand } from './commands/actiondialogfields/index.js';
import { activityFeedCommand } from './commands/activity/index.js';
import { handleFatalError } from './lib/utils/error-handler.js';

const program = new Command();

program
  .name('abs')
  .description('ABSmartly CLI - A/B Testing and Feature Flags command-line tool')
  .version(version)
  .option('--config <path>', 'config file path')
  .option('--api-key <key>', 'override API key')
  .option('--endpoint <url>', 'override API endpoint')
  .option('--app <name>', 'override default application')
  .option('--env <name>', 'override default environment')
  .option(
    '-o, --output <format>',
    'output format (table, json, yaml, plain, markdown, rendered, vertical, template, ids)'
  )
  .option('--no-color', 'disable colored output')
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'minimal output')
  .option('--profile <name>', 'use specific profile')
  .option('--terse', 'show compact format with truncation')
  .option('--full', 'show full text without truncation')
  .option('--raw', 'show raw API response without summarizing or transforming')
  .option(
    '--show <fields...>',
    'include additional fields in the output (where a summarized view exists)'
  )
  .option('--exclude <fields...>', 'hide fields from the output')
  .option(
    '--show-only <fields...>',
    'show only these fields (mutually exclusive with --show and --exclude)'
  )
  .option('--show-request', 'print outgoing HTTP requests to stderr')
  .option('--show-response', 'print HTTP responses to stderr (success and error)')
  .option('--curl', 'print outgoing requests as curl commands to stderr')
  .option(
    '--show-secrets',
    'do not redact the Authorization header in --show-request / --curl output'
  )
  .option(
    '--headers-only',
    'omit request and response bodies in --show-request / --show-response / --curl output'
  )
  .option(
    '--status-only',
    'print only the response status line (implies --show-response; no headers, no body)'
  )
  .option(
    '--dry-run',
    'preview the request without sending it (implies --show-request unless --curl is set)'
  );

program.addCommand(experimentsCommand);
program.addCommand(authCommand);
program.addCommand(configCommand);
program.addCommand(versionCommand);
program.addCommand(appsCommand);
program.addCommand(envsCommand);
program.addCommand(unitsCommand);
program.addCommand(goalsCommand);
program.addCommand(segmentsCommand);
program.addCommand(teamsCommand);
program.addCommand(usersCommand);
program.addCommand(metricsCommand);
program.addCommand(apiCommand);
program.addCommand(openCommand);
program.addCommand(doctorCommand);
program.addCommand(createCompletionCommand(program));
program.addCommand(tagsCommand);
program.addCommand(goalTagsCommand);
program.addCommand(metricTagsCommand);
program.addCommand(metricCategoriesCommand);
program.addCommand(rolesCommand);
program.addCommand(permissionsCommand);
program.addCommand(apiKeysCommand);
program.addCommand(webhooksCommand);
program.addCommand(setupCommand);
program.addCommand(assetRolesCommand);
program.addCommand(favoritesCommand);
program.addCommand(notificationsCommand);

program.addCommand(insightsCommand);
program.addCommand(platformConfigCommand);
program.addCommand(corsCommand);
program.addCommand(datasourcesCommand);
program.addCommand(exportConfigsCommand);
program.addCommand(updateSchedulesCommand);
program.addCommand(customSectionsCommand);
program.addCommand(eventsCommand);
program.addCommand(storageConfigsCommand);
program.addCommand(statisticsCommand);
program.addCommand(actionDialogFieldsCommand);
program.addCommand(activityFeedCommand);
process.on('unhandledRejection', (reason) =>
  handleFatalError('unhandled promise rejection', reason)
);
process.on('uncaughtException', (error) => handleFatalError('uncaught exception', error));

program.parseAsync().catch((error) => handleFatalError('command parsing', error));
