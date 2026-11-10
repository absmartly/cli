import { Command } from 'commander';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  shouldOutputIdsOnly,
  STRUCTURED_FORMATS,
  withErrorHandling,
  type GlobalOptions,
} from '../../lib/utils/api-helper.js';
import { parseUserId } from '../../lib/utils/validators.js';
import type { UserId } from '../../lib/api/branded-types.js';
import { resetUserPassword } from '../../core/users/reset-password.js';

export function printPasswordNotice(
  message: string,
  password: string,
  write: (line: string) => void = console.log
): void {
  write(chalk.green(`✓ ${message}`));
  write(`  New password: ${password}`);
  write(chalk.yellow('  Save this password — it cannot be retrieved later.'));
}

/** Output shared by `users reset-password` and `users create --with-password`. */
export function printPasswordResult(
  globalOptions: GlobalOptions,
  result: {
    id: UserId;
    password: string;
    notice: string;
    payload: Record<string, unknown>;
    rawPayload: unknown;
  }
): void {
  const format = globalOptions.output ?? 'table';
  if (globalOptions.outputExplicit && STRUCTURED_FORMATS.has(format)) {
    // The password is the point of these commands, so include it in the
    // payload (not only under --raw).
    printFormatted(globalOptions.raw ? result.rawPayload : result.payload, globalOptions);
  } else if (shouldOutputIdsOnly(globalOptions)) {
    // Keep stdout to the bare id (-o ids or piped stdout), but never drop
    // the password: it can't be retrieved later, so it goes to stderr.
    console.log(result.id);
    printPasswordNotice(result.notice, result.password, console.error);
  } else {
    printPasswordNotice(result.notice, result.password);
  }
}

export const resetPasswordCommand = new Command('reset-password')
  .description('Reset a user password')
  .argument('<id>', 'user ID', parseUserId)
  .action(
    withErrorHandling(async (id: UserId) => {
      const globalOptions = getGlobalOptions(resetPasswordCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const result = await resetUserPassword(client, { id });
      const message = `Password reset for user ${id}`;
      printPasswordResult(globalOptions, {
        id,
        password: result.data.password,
        notice: message,
        payload: { success: true, message, id, password: result.data.password },
        rawPayload: result.data,
      });
    })
  );
