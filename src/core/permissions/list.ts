import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';

const DEFAULT_PERMISSIONS_PAGE_SIZE = 20;

export interface ListPermissionsParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listPermissions(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listPermissions({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export async function listPermissionCategories(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listPermissionCategories({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export async function listAccessControlPolicies(
  client: APIClient,
  params: ListPermissionsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_PERMISSIONS_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listAccessControlPolicies({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}
