import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { addPaginationOptions, printPaginationFooter } from '../../lib/utils/pagination.js';
import { parseUpdateScheduleId, validateJSON } from '../../lib/utils/validators.js';
import type { UpdateScheduleId } from '../../lib/api/branded-types.js';
import {
  listUpdateSchedules,
  getUpdateSchedule,
  createUpdateSchedule,
  updateUpdateSchedule,
  deleteUpdateSchedule,
} from '../../core/updateschedules/updateschedules.js';

export const updateSchedulesCommand = new Command('update-schedules')
  .aliases(['updateschedules'])
  .description('Experiment update schedule management');

const listCommand = addPaginationOptions(
  new Command('list').description('List experiment update schedules')
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listUpdateSchedules(client, {
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
  .description('Get update schedule details')
  .argument('<id>', 'update schedule ID', parseUpdateScheduleId)
  .action(
    withErrorHandling(async (id: UpdateScheduleId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await getUpdateSchedule(client, { id });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new update schedule')
  .requiredOption('--json-config <json>', 'schedule configuration as JSON')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await createUpdateSchedule(client, { config });
      const data = result.data as { id?: unknown } | undefined;
      printResult(globalOptions, {
        message: `✓ Update schedule created`,
        id: data?.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update an update schedule')
  .argument('<id>', 'update schedule ID', parseUpdateScheduleId)
  .requiredOption('--json-config <json>', 'schedule configuration as JSON')
  .action(
    withErrorHandling(async (id: UpdateScheduleId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const config = validateJSON(options.jsonConfig, '--json-config') as Record<string, unknown>;
      const result = await updateUpdateSchedule(client, { id, config });
      printResult(globalOptions, {
        message: `✓ Update schedule ${id} updated`,
        id,
        raw: result.data,
      });
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete an update schedule')
  .argument('<id>', 'update schedule ID', parseUpdateScheduleId)
  .action(
    withErrorHandling(async (id: UpdateScheduleId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await deleteUpdateSchedule(client, { id });
      printResult(globalOptions, { message: `✓ Update schedule ${id} deleted`, id });
    })
  );

updateSchedulesCommand.addCommand(listCommand);
updateSchedulesCommand.addCommand(getCommand);
updateSchedulesCommand.addCommand(createCommand);
updateSchedulesCommand.addCommand(updateCommand);
updateSchedulesCommand.addCommand(deleteCommand);
