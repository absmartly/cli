import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import {
  getAPIClientFromOptions,
  addFieldProjectionHelp,
  getGlobalOptions,
  printFormatted,
  printResult,
  resolveAPIKey,
  resolveEndpoint,
  withErrorHandling,
  type GlobalOptions,
} from '../../lib/utils/api-helper.js';
import { parseUserId } from '../../lib/utils/validators.js';
import {
  addPaginationOptions,
  printPaginationFooter,
  printFilteredFooter,
} from '../../lib/utils/pagination.js';
import { renderInlineImage, supportsInlineImages } from '../../lib/utils/terminal-image.js';
import type { UserId } from '../../lib/api/branded-types.js';
import {
  applyShowExclude,
  summarizeUserRow,
  summarizeUserDetail,
} from '../../api-client/entity-summary.js';
import type { User } from '../../api-client/types.js';
import { stripApiVersionPath } from '../../lib/utils/url.js';
import {
  listUsers as coreListUsers,
  getUser as coreGetUser,
  createUser as coreCreateUser,
  updateUser as coreUpdateUser,
  archiveUser as coreArchiveUser,
} from '../../core/users/index.js';
import {
  parseFilterValues,
  hasClientFilters,
  resolveRoleIds,
  fetchAllUsers,
  filterUsers,
  buildRoleNameMap,
  formatUserRoles,
  type UserClientFilters,
} from '../../core/users/filter.js';
import { resetPasswordCommand } from './reset-password.js';
import { userApiKeysCommand } from './api-keys.js';

export const usersCommand = new Command('users').alias('user').description('User commands');

async function displayUserAvatar(
  user: User,
  globalOptions: GlobalOptions,
  width: number
): Promise<void> {
  if (!supportsInlineImages() || !user.avatar?.base_url) return;
  const endpoint = resolveEndpoint(globalOptions);
  const baseUrl = stripApiVersionPath(endpoint);
  const apiKey = await resolveAPIKey(globalOptions);
  const thumbSize = Math.min(width * 16, 128);
  const thumbUrl = `${baseUrl}${user.avatar.base_url}/crop/${thumbSize}x${thumbSize}.webp`;
  try {
    const response = await fetch(thumbUrl, {
      headers: { Authorization: `Api-Key ${apiKey}` },
      redirect: 'follow',
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error('Warning: avatar fetch unauthorized -- check API key');
      }
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const img = renderInlineImage(buffer, 'avatar.webp', width);
    if (img) process.stdout.write(`\n${img}\n`);
  } catch (e) {
    if (e instanceof Error && process.env.DEBUG) {
      console.error(`Warning: avatar fetch failed: ${e.message}`);
    }
  }
}

const listCommand = addPaginationOptions(
  new Command('list')
    .description('List all users')
    .option('--include-archived', 'include archived users')
    .option('--search <query>', 'server-side fuzzy search across name/email/department/job_title')
    .option('--sort <field>', 'sort by field (e.g. email, created_at)')
    .option('--asc', 'sort in ascending order')
    .option('--desc', 'sort in descending order')
    .option('--ids <ids>', 'filter by user IDs (comma-separated)')
    .option(
      '--department <values>',
      'filter by department, exact match (comma-separated; use --contains for substring)'
    )
    .option('--role <values>', 'filter by role name or ID (comma-separated; scans all users)')
    .option('--job-title <values>', 'filter by job title, exact match (comma-separated)')
    .option('--email <values>', 'filter by email, exact match (comma-separated)')
    .option('--name <values>', 'filter by full name, exact match (comma-separated)')
    .option(
      '--contains',
      'match --department/--job-title/--email/--name as substrings (case-insensitive)'
    )
    .option(
      '--show-avatars [cols]',
      'display avatars inline, optional width in columns (default: 3)',
      parseInt
    )
).action(
  withErrorHandling(async (options) => {
    const globalOptions = getGlobalOptions(listCommand);
    const client = await getAPIClientFromOptions(globalOptions);
    const { show = [], exclude = [], showOnly } = globalOptions;

    const clientFiltersActive = hasClientFilters({
      department: options.department,
      role: options.role,
      jobTitle: options.jobTitle,
      email: options.email,
      name: options.name,
    });

    const sortAsc = options.asc ? true : options.desc ? false : undefined;
    const rolesColumnActive = clientFiltersActive || Boolean(options.search || options.ids);

    // Resolve client-side filter values up front (role names -> IDs).
    const filters: UserClientFilters = {};
    if (options.department) filters.department = parseFilterValues(options.department);
    if (options.role)
      filters.roleIds = await resolveRoleIds(client, parseFilterValues(options.role));
    if (options.jobTitle) filters.jobTitle = parseFilterValues(options.jobTitle);
    if (options.email) filters.email = parseFilterValues(options.email);
    if (options.name) filters.name = parseFilterValues(options.name);

    let users: unknown[];
    let total: number | undefined;

    if (clientFiltersActive) {
      // Scan all pages honoring native filters, then apply client predicates and
      // paginate the matched set client-side (consistent with --metric on
      // experiments list, PR #47). The API has no server-side department/role
      // filter, so this is the only way to satisfy exact + multi-value asks.
      const scanOptions = {
        ...(options.includeArchived && { includeArchived: true }),
        ...(options.search && { search: options.search }),
        ...(options.sort && { sort: options.sort }),
        ...(sortAsc !== undefined && { sort_asc: sortAsc }),
        ...(options.ids && { ids: options.ids }),
      };
      const all = await fetchAllUsers(client, scanOptions);
      const matched = filterUsers(all, filters, { contains: options.contains });
      total = matched.length;
      const start = (options.page - 1) * options.items;
      users = matched.slice(start, start + options.items);
    } else {
      const result = await coreListUsers(client, {
        includeArchived: options.includeArchived,
        items: options.items,
        page: options.page,
        ...(options.search && { search: options.search }),
        ...(options.sort && { sort: options.sort }),
        ...(sortAsc !== undefined && { sortAsc }),
        ...(options.ids && { ids: options.ids }),
      });
      users = result.data;
    }

    const wantAvatars =
      options.showAvatars !== undefined &&
      supportsInlineImages() &&
      !globalOptions.raw &&
      globalOptions.output !== 'json' &&
      globalOptions.output !== 'yaml';

    // Roles column: shown when a filter is active (client or native search/ids),
    // resolved from a single up-front GET /roles lookup.
    let roleNames: Map<number, string> | undefined;
    if (
      rolesColumnActive &&
      !globalOptions.raw &&
      globalOptions.output !== 'json' &&
      globalOptions.output !== 'yaml'
    ) {
      roleNames = await buildRoleNameMap(client);
    }

    const summarizeWithRoles = (u: Record<string, unknown>): Record<string, unknown> => {
      const row = summarizeUserRow(u);
      if (roleNames) row.roles = formatUserRoles(u, roleNames);
      return row;
    };

    if (wantAvatars) {
      const avatarWidth = typeof options.showAvatars === 'number' ? options.showAvatars : 3;
      const endpoint = resolveEndpoint(globalOptions);
      const baseUrl = stripApiVersionPath(endpoint);
      const apiKey = await resolveAPIKey(globalOptions);
      const headers = { Authorization: `Api-Key ${apiKey}` };

      const avatarMap = new Map<number, string>();
      await Promise.all(
        (users as User[]).map(async (user) => {
          if (!user.avatar?.base_url) return;
          try {
            const thumbSize = Math.min(avatarWidth * 16, 256);
            const thumbUrl = `${baseUrl}${user.avatar.base_url}/crop/${thumbSize}x${thumbSize}.webp`;
            const response = await fetch(thumbUrl, { headers, redirect: 'follow' });
            if (!response.ok) {
              if (response.status === 401 || response.status === 403) {
                console.error('Warning: avatar fetch unauthorized -- check API key');
              }
              return;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            const img = renderInlineImage(buffer, 'avatar.webp', avatarWidth);
            if (img) avatarMap.set(user.id, img);
          } catch (e) {
            if (e instanceof Error && process.env.DEBUG) {
              console.error(`Warning: avatar fetch failed: ${e.message}`);
            }
          }
        })
      );

      const rows = (users as Array<Record<string, unknown>>).map((u) =>
        applyShowExclude(summarizeWithRoles(u), u, show, exclude, showOnly)
      );
      const keys = rows.length > 0 ? Object.keys(rows[0]!) : [];

      const imageHeight = Math.max(1, Math.floor(avatarWidth / 2));

      const table = new Table({
        head: [' ', ...keys.map((k) => chalk.bold.cyan(k))],
        colWidths: [avatarWidth + 2],
        style: { head: [], border: ['gray'] },
      });

      for (const row of rows) {
        table.push([' ', ...keys.map((k) => String(row[k] ?? ''))]);
      }

      const tableLines = table.toString().split('\n');
      const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
      let dataIdx = -1;

      for (const line of tableLines) {
        const stripped = stripAnsi(line);
        const isBorder = /^[├┌└]/.test(stripped);
        if (isBorder) {
          if (!stripped.startsWith('┌')) dataIdx++;
          process.stdout.write(line + '\n');
          continue;
        }

        if (/^│/.test(stripped) && dataIdx >= 0 && dataIdx < rows.length) {
          const img = avatarMap.get(rows[dataIdx]!.id as number);
          if (img) {
            process.stdout.write(line + '\n');
            const emptyBorder = stripped.replace(/[^│]/g, ' ').replace(/│/g, '\x1b[90m│\x1b[0m');
            for (let i = 1; i < imageHeight; i++) {
              process.stdout.write(emptyBorder + '\n');
            }
            process.stdout.write(`\x1b[${imageHeight}A\r\x1b[90m│\x1b[0m ` + img + '\r');
          } else {
            process.stdout.write(line + '\n');
          }
        } else {
          process.stdout.write(line + '\n');
        }
      }
    } else {
      const data = globalOptions.raw
        ? users
        : (users as Array<Record<string, unknown>>).map((u) =>
            applyShowExclude(summarizeWithRoles(u), u, show, exclude, showOnly)
          );
      printFormatted(data, globalOptions);
    }

    if (clientFiltersActive && total !== undefined) {
      printFilteredFooter(total, globalOptions.output as string);
    } else {
      printPaginationFooter(
        users.length,
        options.items,
        options.page,
        globalOptions.output as string
      );
    }
  })
);

const getCommand = new Command('get')
  .description('Get user details')
  .argument('<id>', 'user ID', parseUserId)
  .option(
    '--show-avatars [cols]',
    'display avatar inline, optional width in columns (default: 15)',
    parseInt
  )
  .action(
    withErrorHandling(async (id: UserId, options) => {
      const globalOptions = getGlobalOptions(getCommand);
      const client = await getAPIClientFromOptions(globalOptions);
      const { show = [], exclude = [], showOnly } = globalOptions;

      const result = await coreGetUser(client, { id });
      const user = result.data;
      const data = globalOptions.raw
        ? user
        : applyShowExclude(
            summarizeUserDetail(user as Record<string, unknown>),
            user as Record<string, unknown>,
            show,
            exclude,
            showOnly
          );
      printFormatted(data, globalOptions);

      if (options.showAvatars !== undefined) {
        const width = typeof options.showAvatars === 'number' ? options.showAvatars : 15;
        await displayUserAvatar(user as User, globalOptions, width);
      }
    })
  );

const createCommand = new Command('create')
  .description('Create a new user')
  .requiredOption('--email <email>', 'user email')
  .requiredOption('--name <name>', 'user full name')
  .option('--role <role>', 'user role')
  .action(
    withErrorHandling(async (options) => {
      const globalOptions = getGlobalOptions(createCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      const result = await coreCreateUser(client, {
        email: options.email,
        name: options.name,
        role: options.role,
      });

      printResult(globalOptions, {
        message: `✓ User created with ID: ${result.data.id}`,
        id: result.data.id,
        raw: result.data,
      });
    })
  );

const updateCommand = new Command('update')
  .description('Update a user')
  .argument('<id>', 'user ID', parseUserId)
  .option('--name <name>', 'new full name')
  .option('--role <role>', 'new role')
  .action(
    withErrorHandling(async (id: UserId, options) => {
      const globalOptions = getGlobalOptions(updateCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await coreUpdateUser(client, {
        id,
        name: options.name,
        role: options.role,
      });
      printResult(globalOptions, { message: `✓ User ${id} updated`, id });
    })
  );

const archiveCommand = new Command('archive')
  .description('Archive or unarchive a user')
  .argument('<id>', 'user ID', parseUserId)
  .option('--unarchive', 'unarchive the user')
  .action(
    withErrorHandling(async (id: UserId, options) => {
      const globalOptions = getGlobalOptions(archiveCommand);
      const client = await getAPIClientFromOptions(globalOptions);

      await coreArchiveUser(client, { id, unarchive: options.unarchive });
      const action = options.unarchive ? 'unarchived' : 'archived';
      printResult(globalOptions, { message: `✓ User ${id} ${action}`, id });
    })
  );

usersCommand.addCommand(addFieldProjectionHelp(listCommand));
usersCommand.addCommand(addFieldProjectionHelp(getCommand));
usersCommand.addCommand(createCommand);
usersCommand.addCommand(updateCommand);
usersCommand.addCommand(archiveCommand);
usersCommand.addCommand(resetPasswordCommand);
usersCommand.addCommand(userApiKeysCommand);
