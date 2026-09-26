import { Command } from 'commander';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseWebhookId } from '../../lib/utils/validators.js';
import { createListCommand } from '../../lib/utils/list-command.js';
import { summarizeWebhookRow } from '../../api-client/entity-summary.js';
import type { WebhookId } from '../../lib/api/branded-types.js';
import { getWebhook } from '../../core/webhooks/get.js';
import { createWebhook } from '../../core/webhooks/create.js';
import { updateWebhook } from '../../core/webhooks/update.js';
import { deleteWebhook } from '../../core/webhooks/delete.js';
import { listWebhookEvents } from '../../core/webhooks/events.js';

export const webhooksCommand = new Command('webhooks')
  .alias('webhook')
  .description('Webhook commands');

const listCommand = createListCommand({
  description: 'List all webhooks',
  fetch: (client, options) =>
    client.listWebhooks({
      items: options.items as number,
      page: options.page as number,
      search: options.search as string | undefined,
      sort: options.sort as string | undefined,
      sort_asc: options.asc ? true : options.desc ? false : undefined,
      archived: options.archived as boolean,
      ids: options.ids as string | undefined,
    }),
  summarizeRow: summarizeWebhookRow,
});

const getCommand = new Command('get')
  .description('Get webhook details')
  .argument('<id>', 'webhook ID', parseWebhookId)
  .action(
    withErrorHandling(async (id: WebhookId) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const { show = [], exclude = [], showOnly } = globalOptions;
      const result = await getWebhook(client, {
        id,
        show,
        exclude,
        showOnly,
        raw: globalOptions.raw,
      });
      printFormatted(result.data, globalOptions);
    })
  );

const createCommand = new Command('create')
  .description('Create a new webhook')
  .requiredOption('--name <name>', 'webhook name')
  .requiredOption('--url <url>', 'webhook URL')
  .option('--description <text>', 'webhook description')
  .option('--enabled', 'enable the webhook', true)
  .option('--no-enabled', 'disable the webhook')
  .option('--ordered', 'send events in order', false)
  .option('--max-retries <number>', 'maximum number of retries', parseInt, 3)
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const result = await createWebhook(client, {
        name: options.name,
        url: options.url,
        description: options.description,
        enabled: options.enabled,
        ordered: options.ordered,
        maxRetries: options.maxRetries,
      });
      const newId = (result.data as Record<string, unknown>).id;
      printResult(globalOptions, {
        message: `✓ Webhook created with ID: ${newId}`,
        id: newId,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a webhook')
  .argument('<id>', 'webhook ID', parseWebhookId)
  .option('--name <name>', 'new name')
  .option('--url <url>', 'new URL')
  .option('--description <text>', 'new description')
  .option('--enabled <boolean>', 'enable/disable the webhook', (val) => val === 'true')
  .option('--ordered <boolean>', 'send events in order', (val) => val === 'true')
  .option('--max-retries <number>', 'maximum number of retries', parseInt)
  .action(
    withErrorHandling(async (id: WebhookId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await updateWebhook(client, {
        id,
        name: options.name,
        url: options.url,
        description: options.description,
        enabled: options.enabled,
        ordered: options.ordered,
        maxRetries: options.maxRetries,
      });
      printResult(globalOptions, { message: `✓ Webhook ${id} updated`, id });
    })
  );

const deleteCommand = new Command('delete')
  .description('Delete a webhook')
  .argument('<id>', 'webhook ID', parseWebhookId)
  .action(
    withErrorHandling(async (id: WebhookId) => {
      const globalOptions = getGlobalOptions(deleteCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      await deleteWebhook(client, { id });
      printResult(globalOptions, { message: `✓ Webhook ${id} deleted`, id });
    })
  );

const eventsCommand = new Command('events').description('List webhook event types').action(
  withErrorHandling(async () => {
    const globalOptions = getGlobalOptions(eventsCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const result = await listWebhookEvents(client);
    printFormatted(result.data, globalOptions);
  })
);

webhooksCommand.addCommand(listCommand);
webhooksCommand.addCommand(getCommand);
webhooksCommand.addCommand(createCommand);
webhooksCommand.addCommand(updateCommand);
webhooksCommand.addCommand(deleteCommand);
webhooksCommand.addCommand(eventsCommand);
