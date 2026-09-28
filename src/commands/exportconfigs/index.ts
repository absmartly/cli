import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import { parseExportConfigId, validateJSON } from '../../lib/utils/validators.js';
import type { ExportConfigId } from '../../lib/api/branded-types.js';
import {
  listExportConfigs as coreListExportConfigs,
  getExportConfig as coreGetExportConfig,
  createExportConfig as coreCreateExportConfig,
  updateExportConfig as coreUpdateExportConfig,
  archiveExportConfig as coreArchiveExportConfig,
  pauseExportConfig as corePauseExportConfig,
  listExportHistories as coreListExportHistories,
  cancelExportHistory as coreCancelExportHistory,
} from '../../core/exportconfigs/exportconfigs.js';

export const exportConfigsCommand = new Command('export-configs')
  .aliases(['exportconfigs', 'export-config'])
  .description('Export configuration management');

const listCommand = addPaginationOptions(
  new Command('list').description('List export configurations')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await coreListExportConfigs(client, {
      items: options.items,
      page: options.page,
    });
    printFormatted(result.data, globalOptions);
    printPaginationFooter(
      (result.data as unknown[]).length,
      options.items,
      options.page,
      globalOptions.output as string
    );
  })
);

const getCommand = new Command('get')
  .description('Get export configuration details')
  .argument('<id>', 'export config ID', parseExportConfigId)
  .action(
    withErrorHandling(async (id: ExportConfigId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreGetExportConfig(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new export configuration')
  .requiredOption('--json-config <json>', 'export configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await coreCreateExportConfig(client, { config });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Export configuration created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update an export configuration')
  .argument('<id>', 'export config ID', parseExportConfigId)
  .requiredOption('--json-config <json>', 'export configuration as JSON')
  .action(
    withErrorHandling(async (id: ExportConfigId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await coreUpdateExportConfig(client, { id, config });
      printResult(globalOptions, {
        message: `✓ Export configuration ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const archiveCommand = new Command('archive')
  .description('Archive or unarchive an export configuration')
  .argument('<id>', 'export config ID', parseExportConfigId)
  .option('--unarchive', 'unarchive the configuration', false)
  .action(
    withErrorHandling(async (id: ExportConfigId, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreArchiveExportConfig(client, { id, unarchive: options.unarchive });
      const action = options.unarchive ? 'unarchived' : 'archived';
      printResult(globalOptions, { message: `✓ Export configuration ${id} ${action}`, id });
    })
  );

const pauseCommand = new Command('pause')
  .description('Pause an export configuration')
  .argument('<id>', 'export config ID', parseExportConfigId)
  .action(
    withErrorHandling(async (id: ExportConfigId) => {
      const globalOptions = getGlobalOptions(pauseCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await corePauseExportConfig(client, { id });
      printResult(globalOptions, { message: `✓ Export configuration ${id} paused`, id });
    })
  );

const historiesCommand = new Command('histories')
  .description('List export histories for an export configuration')
  .argument('<id>', 'export config ID', parseExportConfigId)
  .action(
    withErrorHandling(async (id: ExportConfigId) => {
      const globalOptions = getGlobalOptions(historiesCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreListExportHistories(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const cancelHistoryCommand = new Command('cancel-history')
  .description('Cancel a running export history')
  .argument('<export-config-id>', 'export config ID', parseExportConfigId)
  .argument('<history-id>', 'export history ID', parseInt)
  .option('--reason <text>', 'cancellation reason')
  .action(
    withErrorHandling(async (exportConfigId: ExportConfigId, historyId: number, options) => {
      const globalOptions = getGlobalOptions(cancelHistoryCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreCancelExportHistory(client, { exportConfigId, historyId, reason: options.reason });
      printResult(globalOptions, {
        message: `✓ Export history ${historyId} cancelled`,
        id: historyId,
      });
    })
  );

exportConfigsCommand.addCommand(listCommand);
exportConfigsCommand.addCommand(getCommand);
exportConfigsCommand.addCommand(createCommand);
exportConfigsCommand.addCommand(updateCommand);
exportConfigsCommand.addCommand(archiveCommand);
exportConfigsCommand.addCommand(pauseCommand);
exportConfigsCommand.addCommand(historiesCommand);
exportConfigsCommand.addCommand(cancelHistoryCommand);
