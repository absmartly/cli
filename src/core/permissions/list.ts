import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';

const DEFAULT_PERMISSIONS_PAGE_SIZE = 20;

export interface ListPermissionsParams {
  items?: number | undefined;
  page?: number | undefined;
}

// permissions/permission_categories/access_control_policies have no
// server-side items/page support (confirmed against the real backend:
// each route calls its model's getAll() with no query args), unlike the
// other pagination groups this ticket touched. Slicing client-side and
// warning on truncation mirrors this codebase's own notifications
// precedent — without it, `hasMore` would always be true past the first
// page and every subsequent --page would silently re-return the same
// full list.
function paginateClientSide(
  data: unknown[],
  page: number,
  items: number
): { pageData: unknown[]; warnings: string[] | undefined } {
  const start = (page - 1) * items;
  const pageData = data.slice(start, start + items);
  const warnings =
    data.length > items
      ? [`Showing ${pageData.length} of ${data.length} results. Use --page to see more.`]
      : undefined;
  return { pageData, warnings };
}

export async function listPermissions(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const all = await client.listPermissions({ items, page });
  const { pageData, warnings } = paginateClientSide(all as unknown[], page, items);
  return {
    data: pageData,
    warnings,
    pagination: { page, items, hasMore: page * items < (all as unknown[]).length },
  };
}

export async function listPermissionCategories(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const all = await client.listPermissionCategories({ items, page });
  const { pageData, warnings } = paginateClientSide(all as unknown[], page, items);
  return {
    data: pageData,
    warnings,
    pagination: { page, items, hasMore: page * items < (all as unknown[]).length },
  };
}

export async function listAccessControlPolicies(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const all = await client.listAccessControlPolicies({ items, page });
  const { pageData, warnings } = paginateClientSide(all as unknown[], page, items);
  return {
    data: pageData,
    warnings,
    pagination: { page, items, hasMore: page * items < (all as unknown[]).length },
  };
}
