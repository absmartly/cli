import type { APIClient } from '../../api-client/api-client.js';
import type { AssetRoleId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';
import { requireAtLeastOneField } from '../../lib/utils/validators.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListAssetRolesParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listAssetRoles(
  client: APIClient,
  params: ListAssetRolesParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listAssetRoles({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetAssetRoleParams {
  id: AssetRoleId;
}

export async function getAssetRole(
  client: APIClient,
  params: GetAssetRoleParams
): Promise<CommandResult<unknown>> {
  const data = await client.getAssetRole(params.id);
  return { data };
}

export interface CreateAssetRoleParams {
  name: string;
}

export async function createAssetRole(
  client: APIClient,
  params: CreateAssetRoleParams
): Promise<CommandResult<unknown>> {
  const data = await client.createAssetRole({ name: params.name });
  return { data };
}

export interface UpdateAssetRoleParams {
  id: AssetRoleId;
  name?: string | undefined;
}

export async function updateAssetRole(
  client: APIClient,
  params: UpdateAssetRoleParams
): Promise<CommandResult<unknown>> {
  const data: Record<string, unknown> = {};
  if (params.name !== undefined) data.name = params.name;

  requireAtLeastOneField(data, 'update field');
  await client.updateAssetRole(params.id, data);
  return { data: { id: params.id } };
}

export interface DeleteAssetRoleParams {
  id: AssetRoleId;
}

export async function deleteAssetRole(
  client: APIClient,
  params: DeleteAssetRoleParams
): Promise<CommandResult<unknown>> {
  await client.deleteAssetRole(params.id);
  return { data: { id: params.id } };
}
