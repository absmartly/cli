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
import {
  listStorageConfigs,
  getStorageConfig,
  createStorageConfig,
  updateStorageConfig,
  testStorageConfig,
} from '../../core/storageconfigs/storageconfigs.js';

export const storageConfigsCommand = new Command('storage-configs')
  .aliases(['storageconfigs', 'storage-config'])
  .description('Storage config management');

const listCommand = addPaginationOptions(
  new Command('list').description('List storage configs')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listStorageConfigs(client, {
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
  .description('Get storage config details')
  .argument('<id>', 'storage config ID', (v: string) => parseInt(v, 10))
  .action(
    withErrorHandling(async (id: number) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await getStorageConfig(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new storage config')
  .requiredOption('--json-config <json>', 'storage config configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await createStorageConfig(client, { config });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Storage config created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a storage config')
  .argument('<id>', 'storage config ID', (v: string) => parseInt(v, 10))
  .requiredOption('--json-config <json>', 'storage config configuration as JSON')
  .action(
    withErrorHandling(async (id: number, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await updateStorageConfig(client, { id, config });
      printResult(globalOptions, {
        message: `✓ Storage config ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const testCommand = new Command('test')
  .description('Test storage config connection')
  .requiredOption('--json-config <json>', 'storage config configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(testCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      await testStorageConfig(client, { config });
      printResult(globalOptions, { message: `✓ Storage config connection test passed` });
    })
  );

storageConfigsCommand.addCommand(listCommand);
storageConfigsCommand.addCommand(getCommand);
storageConfigsCommand.addCommand(createCommand);
storageConfigsCommand.addCommand(updateCommand);
storageConfigsCommand.addCommand(testCommand);
