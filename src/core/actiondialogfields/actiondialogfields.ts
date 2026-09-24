import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListActionDialogFieldsParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listActionDialogFields(
  client: APIClient,
  params: ListActionDialogFieldsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listExperimentActionDialogFields({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetActionDialogFieldParams {
  id: number;
}

export async function getActionDialogField(
  client: APIClient,
  params: GetActionDialogFieldParams
): Promise<CommandResult<unknown>> {
  const data = await client.getExperimentActionDialogField(params.id);
  return { data };
}

export interface CreateActionDialogFieldParams {
  config: Record<string, unknown>;
}

export async function createActionDialogField(
  client: APIClient,
  params: CreateActionDialogFieldParams
): Promise<CommandResult<unknown>> {
  const data = await client.createExperimentActionDialogField(params.config);
  return { data };
}

export interface UpdateActionDialogFieldParams {
  id: number;
  config: Record<string, unknown>;
}

export async function updateActionDialogField(
  client: APIClient,
  params: UpdateActionDialogFieldParams
): Promise<CommandResult<unknown>> {
  const data = await client.updateExperimentActionDialogField(params.id, params.config);
  return { data };
}
