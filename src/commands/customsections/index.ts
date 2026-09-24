import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import { parseCustomSectionId } from '../../lib/utils/validators.js';
import type { CustomSectionId } from '../../lib/api/branded-types.js';
import {
  listCustomSections,
  createCustomSection,
  updateCustomSection,
  archiveCustomSection,
  reorderCustomSections,
} from '../../core/customsections/customsections.js';

export const customSectionsCommand = new Command('custom-sections')
  .alias('customsections')
  .description('Experiment custom section commands');

const listCommand = addPaginationOptions(
  new Command('list').description('List all experiment custom sections')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listCustomSections(client, {
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

const createCommand = new Command('create')
  .description('Create a new experiment custom section')
  .requiredOption('--name <name>', 'section name')
  .requiredOption('--type <type>', 'section type')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await createCustomSection(client, { name: options.name, type: options.type });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Custom section created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a custom section')
  .argument('<id>', 'section ID', parseCustomSectionId)
  .option('--name <name>', 'new section name')
  .action(
    withErrorHandling(async (id: CustomSectionId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await updateCustomSection(client, { id, name: options.name });
      printResult(globalOptions, {
        message: `✓ Custom section ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const archiveCommand = new Command('archive')
  .description('Archive or unarchive a custom section')
  .argument('<id>', 'section ID', parseCustomSectionId)
  .option('--unarchive', 'unarchive the section')
  .action(
    withErrorHandling(async (id: CustomSectionId, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await archiveCustomSection(client, { id, unarchive: !!options.unarchive });
      const action = options.unarchive ? 'unarchived' : 'archived';
      printResult(globalOptions, { message: `✓ Custom section ${id} ${action}`, id });
    })
  );

const reorderCommand = new Command('reorder')
  .description('Reorder custom sections')
  .requiredOption('--sections <pairs>', 'comma-separated id:order_index pairs (e.g., 1:0,2:1,3:2)')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(reorderCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const sections = options.sections.split(',').map((pair: string) => {
        const [idStr, orderStr] = pair.trim().split(':');
        const id = parseInt(idStr ?? '', 10);
        const order_index = parseInt(orderStr ?? '', 10);
        if (Number.isNaN(id) || Number.isNaN(order_index)) {
          throw new Error(
            `Invalid section pair: "${pair}". Expected format: id:order_index (e.g., 1:0)`
          );
        }
        return { id, order_index };
      });
      await reorderCustomSections(client, { sections });
      printResult(globalOptions, { message: `✓ Custom sections reordered` });
    })
  );

customSectionsCommand.addCommand(listCommand);
customSectionsCommand.addCommand(createCommand);
customSectionsCommand.addCommand(updateCommand);
customSectionsCommand.addCommand(archiveCommand);
customSectionsCommand.addCommand(reorderCommand);
