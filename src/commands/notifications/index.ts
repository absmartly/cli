import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import {
  listNotifications as coreListNotifications,
  markNotificationsSeen as coreMarkNotificationsSeen,
  markNotificationsRead as coreMarkNotificationsRead,
  checkNotifications as coreCheckNotifications,
} from '../../core/notifications/notifications.js';

export const notificationsCommand = new Command('notifications')
  .alias('notification')
  .alias('notif')
  .description('Notifications commands');

const listCommand = new Command('list')
  .description('List notifications')
  .option('--cursor <n>', 'pagination cursor', parseInt)
  .option('--limit <n>', 'max number of notifications to show', parseInt)
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(listCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreListNotifications(client, {
        cursor: options.cursor,
        limit: options.limit,
      });
      printFormatted(result.data, globalOptions);
      if (
        result.warnings &&
        globalOptions.output !== 'json' &&
        globalOptions.output !== 'yaml'
      ) {
        for (const w of result.warnings) {
          console.log(chalk.gray(w));
        }
      }
    })
  );

const markSeenCommand = new Command('mark-seen')
  .description('Mark all notifications as seen')
  .action(
    withErrorHandling(async () => {
      const globalOptions = getGlobalOptions(markSeenCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await coreMarkNotificationsSeen(client);
      printResult(globalOptions, { message: '✓ All notifications marked as seen' });
    })
  );

const markReadCommand = new Command('mark-read')
  .description('Mark notifications as read')
  .option('--ids <ids>', 'comma-separated notification IDs (omit to mark all)')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(markReadCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const ids = options.ids
        ? options.ids.split(',').map((s: string) => parseInt(s.trim(), 10))
        : undefined;
      await coreMarkNotificationsRead(client, { ids });
      printResult(globalOptions, { message: '✓ Notifications marked as read' });
    })
  );

const checkCommand = new Command('check')
  .description('Check if there are new notifications')
  .option('--last-id <n>', 'last known notification ID', parseInt)
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(checkCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await coreCheckNotifications(client, { lastId: options.lastId });
      if (result.data.hasNew) {
        console.log(chalk.yellow('You have new notifications'));
      } else {
        console.log(chalk.green('No new notifications'));
      }
    })
  );

notificationsCommand.addCommand(listCommand);
notificationsCommand.addCommand(markSeenCommand);
notificationsCommand.addCommand(markReadCommand);
notificationsCommand.addCommand(checkCommand);
