import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import { parseAssetRoleId } from '../../lib/utils/validators.js';
import type { AssetRoleId } from '../../lib/api/branded-types.js';
import {
  listAssetRoles,
  getAssetRole,
  createAssetRole,
  updateAssetRole,
  deleteAssetRole,
} from '../../core/assetroles/assetroles.js';

export const assetRolesCommand = new Command('asset-roles')
  .alias('assetroles')
  .description('Asset role commands');

const listCommand = addPaginationOptions(
  new Command('list').description('List all asset roles')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listAssetRoles(client, { items: options.items, page: options.page });
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
  .description('Get asset role details')
  .argument('<id>', 'asset role ID', parseAssetRoleId)
  .action(
    withErrorHandling(async (id: AssetRoleId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await getAssetRole(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new asset role')
  .requiredOption('--name <name>', 'asset role name')
  .action(
    withErrorHandling(async (options: { name: string }) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await createAssetRole(client, { name: options.name });
      const newId = (result.data as Record<string, unknown>).id;
      printResult(globalOptions, {
        message: `✓ Asset role created with ID: ${newId}`,
        id: newId,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update an asset role')
  .argument('<id>', 'asset role ID', parseAssetRoleId)
  .option('--name <name>', 'new name')
  .action(
    withErrorHandling(async (id: AssetRoleId, options: { name?: string }) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await updateAssetRole(client, { id, name: options.name });
      printResult(globalOptions, { message: `✓ Asset role ${id} updated`, id });
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete an asset role')
  .argument('<id>', 'asset role ID', parseAssetRoleId)
  .action(
    withErrorHandling(async (id: AssetRoleId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await deleteAssetRole(client, { id });
      printResult(globalOptions, { message: `✓ Asset role ${id} deleted`, id });
    })
  );

assetRolesCommand.addCommand(listCommand);
assetRolesCommand.addCommand(getCommand);
assetRolesCommand.addCommand(createCommand);
assetRolesCommand.addCommand(updateCommand);
assetRolesCommand.addCommand(deleteCommand);
