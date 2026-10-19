import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  withErrorHandling,
} from '../../lib/utils/api-helper.js';
import { parseUserId } from '../../lib/utils/validators.js';
import type { UserId } from '../../lib/api/branded-types.js';
import { resetUserPassword } from '../../core/users/reset-password.js';

export function printPasswordNotice(message: string, password: string): void {
  console.log(chalk.green(`✓ ${message}`));
  console.log(`  New password: ${password}`);
  console.log(chalk.yellow('  Save this password — it cannot be retrieved later.'));
}

export const resetPasswordCommand = new Command('reset-password')
  .description('Reset a user password')
  .argument('<id>', 'user ID', parseUserId)
  .action(
    withErrorHandling(async (id: UserId) => {
      const globalOptions = getGlobalOptions(resetPasswordCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const result = await resetUserPassword(client, { id });
      const format = globalOptions.output ?? 'table';
      if (format === 'table' || format === 'rendered') {
        printPasswordNotice(`Password reset for user ${id}`, result.data.password);
      } else if (format === 'ids') {
        console.log(id);
      } else {
        // Structured/plain formats: the password is the point of this command,
        // so include it in the payload (not only under --raw).
        printFormatted(
          {
            success: true,
            message: `Password reset for user ${id}`,
            id,
            password: result.data.password,
          },
          globalOptions
        );
      }
    })
  );
