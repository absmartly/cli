import type { APIClient } from '../../api-client/api-client.js';
import type { UpdateScheduleId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListUpdateSchedulesParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listUpdateSchedules(
  client: APIClient,
  params: ListUpdateSchedulesParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listUpdateSchedules({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetUpdateScheduleParams {
  id: UpdateScheduleId;
}

export async function getUpdateSchedule(
  client: APIClient,
  params: GetUpdateScheduleParams
): Promise<CommandResult<unknown>> {
  const data = await client.getUpdateSchedule(params.id);
  return { data };
}

export interface CreateUpdateScheduleParams {
  config: Record<string, unknown>;
}

export async function createUpdateSchedule(
  client: APIClient,
  params: CreateUpdateScheduleParams
): Promise<CommandResult<unknown>> {
  const data = await client.createUpdateSchedule(params.config);
  return { data };
}

export interface UpdateUpdateScheduleParams {
  id: UpdateScheduleId;
  config: Record<string, unknown>;
}

export async function updateUpdateSchedule(
  client: APIClient,
  params: UpdateUpdateScheduleParams
): Promise<CommandResult<unknown>> {
  const data = await client.updateUpdateSchedule(params.id, params.config);
  return { data };
}

export interface DeleteUpdateScheduleParams {
  id: UpdateScheduleId;
}

export async function deleteUpdateSchedule(
  client: APIClient,
  params: DeleteUpdateScheduleParams
): Promise<CommandResult<unknown>> {
  await client.deleteUpdateSchedule(params.id);
  return { data: { id: params.id } };
}
