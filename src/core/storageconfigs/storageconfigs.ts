import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListStorageConfigsParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listStorageConfigs(
  client: APIClient,
  params: ListStorageConfigsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listStorageConfigs({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetStorageConfigParams {
  id: number;
}

export async function getStorageConfig(
  client: APIClient,
  params: GetStorageConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.getStorageConfig(params.id);
  return { data };
}

export interface CreateStorageConfigParams {
  config: Record<string, unknown>;
}

export async function createStorageConfig(
  client: APIClient,
  params: CreateStorageConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.createStorageConfig(params.config);
  return { data };
}

export interface UpdateStorageConfigParams {
  id: number;
  config: Record<string, unknown>;
}

export async function updateStorageConfig(
  client: APIClient,
  params: UpdateStorageConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.updateStorageConfig(params.id, params.config);
  return { data };
}

export interface TestStorageConfigParams {
  config: Record<string, unknown>;
}

export async function testStorageConfig(
  client: APIClient,
  params: TestStorageConfigParams
): Promise<CommandResult<unknown>> {
  await client.testStorageConfig(params.config);
  return { data: { success: true } };
}
