import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  addFieldProjectionHelp,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseGoalId } from '../../lib/utils/validators.js';
import type { GoalId } from '../../lib/api/branded-types.js';
import { summarizeGoalRow } from '../../api-client/entity-summary.js';
import { createListCommand } from '../../lib/utils/list-command.js';
import { getGoal } from '../../core/goals/get.js';
import { createGoal } from '../../core/goals/create.js';
import { updateGoal } from '../../core/goals/update.js';
import { accessCommand } from './access.js';
import { followCommand, unfollowCommand } from './follow.js';

export const goalsCommand = new Command('goals').alias('goal').description('Goal commands');

const listCommand = createListCommand({
  description: 'List all goals',
  fetch: (client, options) =>
    client.listGoals({
      items: options.items as number,
      page: options.page as number,
      search: options.search as string | undefined,
      sort: options.sort as string | undefined,
      sort_asc: options.asc ? true : options.desc ? false : undefined,
      archived: options.archived as boolean,
      ids: options.ids as string | undefined,
    }),
  summarizeRow: summarizeGoalRow,
});

const getCommand = new Command('get')
  .description('Get goal details')
  .argument('<id>', 'goal ID', parseGoalId)
  .action(
    withErrorHandling(async (id: GoalId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const { show = [], exclude = [], showOnly } = globalOptions;

      const result = await getGoal(client, { id, show, exclude, showOnly, raw: globalOptions.raw });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new goal')
  .requiredOption('--name <name>', 'goal name')
  .option('--description <text>', 'goal description')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const result = await createGoal(client, {
        name: options.name,
        description: options.description,
      });

      printResult(globalOptions, {
        message: `✓ Goal created with ID: ${result.data.id}`,
        id: result.data.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a goal')
  .argument('<id>', 'goal ID', parseGoalId)
  .option('--description <text>', 'new description')
  .action(
    withErrorHandling(async (id: GoalId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await updateGoal(client, {
        id,
        description: options.description,
      });
      printResult(globalOptions, { message: `✓ Goal ${id} updated`, id });
    })
  );

goalsCommand.addCommand(listCommand);
goalsCommand.addCommand(addFieldProjectionHelp(getCommand));
goalsCommand.addCommand(createCommand);
goalsCommand.addCommand(updateCommand);
goalsCommand.addCommand(accessCommand);
goalsCommand.addCommand(followCommand);
goalsCommand.addCommand(unfollowCommand);
