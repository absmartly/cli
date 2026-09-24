import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import {
  listPermissions,
  listPermissionCategories,
  listAccessControlPolicies,
} from '../../core/permissions/list.js';

export const permissionsCommand = new Command('permissions')
  .aliases(['permission', 'perms', 'perm'])
  .description('Permission commands');

const listCommand = addPaginationOptions(
  new Command('list').description('List all permissions')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listPermissions(client, { items: options.items, page: options.page });
    printFormatted(result.data, globalOptions);
    printPaginationFooter(
      (result.data as unknown[]).length,
      options.items,
      options.page,
      globalOptions.output as string
    );
  })
);

const categoriesCommand = addPaginationOptions(
  new Command('categories').aliases(['cats', 'cat']).description('List permission categories')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(categoriesCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listPermissionCategories(client, {
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

const policiesCommand = addPaginationOptions(
  new Command('policies').description('List access control policies')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(policiesCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listAccessControlPolicies(client, {
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

permissionsCommand.addCommand(listCommand);
permissionsCommand.addCommand(categoriesCommand);
permissionsCommand.addCommand(policiesCommand);
