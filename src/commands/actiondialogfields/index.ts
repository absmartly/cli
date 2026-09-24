import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { validateJSON } from '../../lib/utils/validators.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ID: "${value}". Expected a positive integer.`);
  }
  return parsed;
}
import {
  listActionDialogFields as coreListActionDialogFields,
  getActionDialogField as coreGetActionDialogField,
  createActionDialogField as coreCreateActionDialogField,
  updateActionDialogField as coreUpdateActionDialogField,
} from '../../core/actiondialogfields/actiondialogfields.js';

export const actionDialogFieldsCommand = new Command('action-dialog-fields')
  .aliases(['actiondialogfields'])
  .description('Action dialog field management');

const listCommand = addPaginationOptions(
  new Command('list').description('List action dialog fields')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await coreListActionDialogFields(client, {
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
  .description('Get action dialog field details')
  .argument('<id>', 'action dialog field ID', parsePositiveInt)
  .action(
    withErrorHandling(async (id: number) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreGetActionDialogField(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new action dialog field')
  .requiredOption('--json-config <json>', 'action dialog field configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config');
      if (config === null || Array.isArray(config) || typeof config !== 'object') {
        throw new Error('--config must be a JSON object (not null, array, or primitive)');
      }
      const result = await coreCreateActionDialogField(client, {
        config: config as Record<string, unknown>,
      });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Action dialog field created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update an action dialog field')
  .argument('<id>', 'action dialog field ID', parsePositiveInt)
  .requiredOption('--json-config <json>', 'action dialog field configuration as JSON')
  .action(
    withErrorHandling(async (id: number, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config');
      if (config === null || Array.isArray(config) || typeof config !== 'object') {
        throw new Error('--config must be a JSON object (not null, array, or primitive)');
      }
      const result = await coreUpdateActionDialogField(client, {
        id,
        config: config as Record<string, unknown>,
      });
      printResult(globalOptions, {
        message: `✓ Action dialog field ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

actionDialogFieldsCommand.addCommand(listCommand);
actionDialogFieldsCommand.addCommand(getCommand);
actionDialogFieldsCommand.addCommand(createCommand);
actionDialogFieldsCommand.addCommand(updateCommand);
