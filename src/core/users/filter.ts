import type { APIClient } from '../../api-client/api-client.js';

/** Page size used when scanning every user to apply client-side filters. */
export const USER_FILTER_SCAN_PAGE_SIZE = 200;

export interface UserClientFilters {
  department?: string[];
  roleIds?: number[];
  jobTitle?: string[];
  email?: string[];
  name?: string[];
}

export interface ListUsersScanOptions {
  includeArchived?: boolean;
  search?: string;
  sort?: string;
  sort_asc?: boolean;
  ids?: string;
}

/**
 * Parse a comma-separated filter flag into a trimmed, blank-dropped,
 * case-insensitively deduped list, keeping the first-seen spelling.
 */
export function parseFilterValues(input?: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(',')) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * True iff any client-side filter flag is set to a non-empty string.
 * Native flags like `search`/`sort` are not client filters.
 */
export function hasClientFilters(options: {
  department?: string;
  role?: string;
  jobTitle?: string;
  email?: string;
  name?: string;
}): boolean {
  return Boolean(
    options.department?.trim() ||
    options.role?.trim() ||
    options.jobTitle?.trim() ||
    options.email?.trim() ||
    options.name?.trim()
  );
}

/** Join a user's first and last name with a space, omitting missing parts. */
export function userFullName(user: Record<string, unknown>): string {
  return [user.first_name, user.last_name]
    .filter((x) => typeof x === 'string' && x.length > 0)
    .join(' ');
}

/**
 * Collect role IDs from a user's `user_team_roles` entries. Tolerant of
 * missing or malformed data; returns [] when there is nothing to extract.
 *
 * Flattens `role_ids` across all `user_team_roles` entries. For the `GET /users`
 * list response this is effectively the user's global-team roles: the backend
 * includes `user_team_roles` filtered to the global team only, so no per-entry
 * `team_id` check is needed here.
 *
 * Typed as `Record<string, unknown>` (not the exported `User` type) on purpose:
 * `user_team_roles`/`role_ids` are populated by the live `GET /users` response
 * but are absent from the generated OpenAPI schema, so a typed field access is
 * not available here.
 */
export function userGlobalRoleIds(user: Record<string, unknown>): number[] {
  const entries = user.user_team_roles;
  if (!Array.isArray(entries)) return [];
  const ids: number[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const roleIds = (entry as Record<string, unknown>).role_ids;
    if (!Array.isArray(roleIds)) continue;
    for (const id of roleIds) {
      const n = Number(id);
      if (!Number.isFinite(n)) continue;
      ids.push(n);
    }
  }
  return ids;
}

function matchesField(candidate: string, values: string[] | undefined, contains: boolean): boolean {
  if (!values || values.length === 0) return true;
  const c = candidate.toLowerCase();
  for (const v of values) {
    const want = v.toLowerCase();
    if (contains ? c.includes(want) : c === want) return true;
  }
  return false;
}

/**
 * Resolve role flag values to role IDs. Numeric tokens are validated to exist
 * (via a single batched `listRoles({ ids })` lookup); names are matched exactly
 * and case-insensitively against `listRoles({ search })`. Errors on unknown IDs
 * and on no/multiple name matches. Result is deduped, preserving first-seen
 * order.
 */
export async function resolveRoleIds(client: APIClient, values: string[]): Promise<number[]> {
  const ids: number[] = [];
  const seen = new Set<number>();

  const add = (id: number): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };

  const numericIds: number[] = [];
  const names: string[] = [];
  for (const value of values) {
    const id = Number(value);
    if (Number.isFinite(id) && String(id) === value.trim()) {
      numericIds.push(id);
    } else {
      names.push(value);
    }
  }

  // Validate numeric IDs in one batch so a typo'd ID errors instead of
  // silently matching zero users, symmetric with name resolution below.
  if (numericIds.length > 0) {
    const found = (await client.listRoles({
      ids: numericIds.join(','),
      items: USER_FILTER_SCAN_PAGE_SIZE,
    })) as Array<Record<string, unknown>>;
    const foundIds = new Set(found.map((r) => Number(r.id)));
    const missing = numericIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new Error(
        `No role found with ID ${missing.join(', ')}. Check the role ID(s) with \`abs roles list\`.`
      );
    }
    for (const id of numericIds) add(id);
  }

  for (const value of names) {
    const roles = (await client.listRoles({
      search: value,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    })) as Array<Record<string, unknown>>;
    const exact = roles.filter((r) => String(r.name ?? '').toLowerCase() === value.toLowerCase());
    if (exact.length === 0) {
      throw new Error(
        `No role found matching name "${value}". Use a numeric role ID, or check the name.`
      );
    }
    if (exact.length > 1) {
      const candidates = exact.map((r) => `  ${r.id} ${r.name}`).join('\n');
      throw new Error(
        `Multiple roles match name "${value}":\n${candidates}\nUse a numeric role ID to disambiguate.`
      );
    }
    add(Number(exact[0]!.id));
  }

  return ids;
}

/**
 * Fetch every user by paging through `listUsers` at a fixed page size until a
 * short page is returned. Native `baseOptions` are honored on every page.
 */
export async function fetchAllUsers(
  client: APIClient,
  baseOptions: ListUsersScanOptions
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let page = 1;
  for (;;) {
    const batch = (await client.listUsers({
      ...baseOptions,
      page,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    })) as Array<Record<string, unknown>>;
    all.push(...batch);
    if (batch.length < USER_FILTER_SCAN_PAGE_SIZE) break;
    page++;
  }
  return all;
}

/**
 * Filter users by client predicates: OR within a field's values, AND across
 * fields. `department`/`jobTitle`/`email`/`name` match exactly by default and
 * as substrings when `contains` is true; `roleIds` matches by exact ID
 * (unaffected by `contains`). Returns the matching user objects unchanged.
 */
export function filterUsers(
  users: Array<Record<string, unknown>>,
  filters: UserClientFilters,
  options: { contains?: boolean } = {}
): Array<Record<string, unknown>> {
  const contains = Boolean(options.contains);
  return users.filter((u) => {
    if (
      filters.department &&
      !matchesField(String(u.department ?? ''), filters.department, contains)
    )
      return false;
    if (filters.jobTitle && !matchesField(String(u.job_title ?? ''), filters.jobTitle, contains))
      return false;
    if (filters.email && !matchesField(String(u.email ?? ''), filters.email, contains))
      return false;
    if (filters.name && !matchesField(userFullName(u), filters.name, contains)) return false;
    if (filters.roleIds && filters.roleIds.length > 0) {
      const userRoleIds = userGlobalRoleIds(u);
      if (!filters.roleIds.some((id) => userRoleIds.includes(id))) return false;
    }
    return true;
  });
}

/**
 * Scan all roles at 200/page and return a Map of role ID -> role name, for
 * rendering the roles column of filtered users.
 */
export async function buildRoleNameMap(client: APIClient): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  for (;;) {
    const roles = (await client.listRoles({
      page,
      items: USER_FILTER_SCAN_PAGE_SIZE,
    })) as Array<Record<string, unknown>>;
    for (const r of roles) {
      const id = Number(r.id);
      if (Number.isFinite(id)) map.set(id, String(r.name ?? `#${id}`));
    }
    if (roles.length < USER_FILTER_SCAN_PAGE_SIZE) break;
    page++;
  }
  return map;
}

/**
 * Render a user's global-team role names, sorted by role ID ascending and
 * joined with ", ". Unknown IDs fall back to "#<id>"; a user with no roles
 * renders as an empty string.
 */
export function formatUserRoles(
  user: Record<string, unknown>,
  roleNames: Map<number, string>
): string {
  const ids = userGlobalRoleIds(user)
    .slice()
    .sort((a, b) => a - b);
  return ids.map((id) => roleNames.get(id) ?? `#${id}`).join(', ');
}
