import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import { parseCorsOriginId } from '../../lib/utils/validators.js';
import type { CorsOriginId } from '../../lib/api/branded-types.js';
import {
  listCorsOrigins,
  getCorsOrigin,
  createCorsOrigin,
  updateCorsOrigin,
  deleteCorsOrigin,
} from '../../core/cors/cors.js';

export const corsCommand = new Command('cors').description('CORS origins management');

const listCommand = addPaginationOptions(
  new Command('list').description('List CORS allowed origins')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listCorsOrigins(client, { items: options.items, page: options.page });
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
  .description('Get CORS origin details')
  .argument('<id>', 'CORS origin ID', parseCorsOriginId)
  .action(
    withErrorHandling(async (id: CorsOriginId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await getCorsOrigin(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new CORS allowed origin')
  .requiredOption('--origin <url>', 'origin URL')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await createCorsOrigin(client, { origin: options.origin });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ CORS origin created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a CORS allowed origin')
  .argument('<id>', 'CORS origin ID', parseCorsOriginId)
  .requiredOption('--origin <url>', 'new origin URL')
  .action(
    withErrorHandling(async (id: CorsOriginId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await updateCorsOrigin(client, { id, origin: options.origin });
      printResult(globalOptions, {
        message: `✓ CORS origin ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete a CORS allowed origin')
  .argument('<id>', 'CORS origin ID', parseCorsOriginId)
  .action(
    withErrorHandling(async (id: CorsOriginId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await deleteCorsOrigin(client, { id });
      printResult(globalOptions, { message: `✓ CORS origin ${id} deleted`, id });
    })
  );

corsCommand.addCommand(listCommand);
corsCommand.addCommand(getCommand);
corsCommand.addCommand(createCommand);
corsCommand.addCommand(updateCommand);
corsCommand.addCommand(deleteCommand);
