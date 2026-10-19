import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseRoleId } from '../../lib/utils/validators.js';
import { createListCommand } from '../../lib/utils/list-command.js';
import type { RoleId } from '../../lib/api/branded-types.js';
import { getRole, createRole, updateRole, deleteRole } from '../../core/roles/index.js';
import { summarizeNamedEntityRow, groupRolePermissions } from '../../api-client/entity-summary.js';

export const rolesCommand = new Command('roles').alias('role').description('Role commands');

const listCommand = createListCommand({
  description: 'List all roles',
  fetch: (client, options) =>
    client.listRoles({
      items: options.items as number,
      page: options.page as number,
      search: options.search as string | undefined,
      sort: options.sort as string | undefined,
      sort_asc: options.asc ? true : options.desc ? false : undefined,
      archived: options.archived as boolean,
      ids: options.ids as string | undefined,
    }),
  summarizeRow: summarizeNamedEntityRow,
});

const getCommand = new Command('get')
  .description('Get role details')
  .argument('<id>', 'role ID', parseRoleId)
  .action(
    withErrorHandling(async (id: RoleId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await getRole(client, { id });
      if (globalOptions.raw) {
        printFormatted(result.data, globalOptions);
        return;
      }
      const categories = await client
        .listPermissionCategories({ items: 500 })
        .catch(() => [] as Array<{ id: number; name: string }>);
      printFormatted(
        groupRolePermissions(result.data as Record<string, unknown>, categories),
        globalOptions
      );
    })
  );

const createCommand = new Command('create')
  .description('Create a new role')
  .requiredOption('--name <name>', 'role name')
  .option('--description <text>', 'role description')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await createRole(client, {
        name: options.name,
        description: options.description,
      });
      const newId = (result.data as Record<string, unknown>).id;
      printResult(globalOptions, {
        message: `✓ Role created with ID: ${newId}`,
        id: newId,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a role')
  .argument('<id>', 'role ID', parseRoleId)
  .option('--name <name>', 'new name')
  .option('--description <text>', 'new description')
  .action(
    withErrorHandling(async (id: RoleId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await updateRole(client, {
        id,
        name: options.name,
        description: options.description,
      });
      printResult(globalOptions, { message: `✓ Role ${id} updated`, id });
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete a role')
  .argument('<id>', 'role ID', parseRoleId)
  .action(
    withErrorHandling(async (id: RoleId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await deleteRole(client, { id });
      printResult(globalOptions, { message: `✓ Role ${id} deleted`, id });
    })
  );

rolesCommand.addCommand(listCommand);
rolesCommand.addCommand(getCommand);
rolesCommand.addCommand(createCommand);
rolesCommand.addCommand(updateCommand);
rolesCommand.addCommand(deleteCommand);
