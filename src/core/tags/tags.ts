import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import type { TagId } from '../../lib/api/branded-types.js';
import { requireAtLeastOneField } from '../../lib/utils/validators.js';
import { summarizeTagRow } from '../../api-client/entity-summary.js';

export interface ListTagsParams {
  items: number;
  page: number;
}

export async function listTags(
  client: APIClient,
  params: ListTagsParams
): Promise<CommandResult<unknown[]>> {
  const data = await client.listExperimentTags({ items: params.items, page: params.page });
  return { data, rows: (data as Array<Record<string, unknown>>).map(summarizeTagRow) };
}

export interface GetTagParams {
  id: TagId;
}

export async function getTag(
  client: APIClient,
  params: GetTagParams
): Promise<CommandResult<unknown>> {
  const data = await client.getExperimentTag(params.id);
  return { data };
}

export interface CreateTagParams {
  tag: string;
}

export async function createTag(
  client: APIClient,
  params: CreateTagParams
): Promise<CommandResult<unknown>> {
  const data = await client.createExperimentTag({ tag: params.tag });
  return { data };
}

export interface UpdateTagParams {
  id: TagId;
  tag?: string | undefined;
}

export async function updateTag(
  client: APIClient,
  params: UpdateTagParams
): Promise<CommandResult<unknown>> {
  const data: { tag?: string } = {};
  if (params.tag) data.tag = params.tag;

  requireAtLeastOneField(data, 'update field');
  const result = await client.updateExperimentTag(params.id, data as { tag: string });
  return { data: result };
}

export interface DeleteTagParams {
  id: TagId;
}

export async function deleteTag(
  client: APIClient,
  params: DeleteTagParams
): Promise<CommandResult<unknown>> {
  await client.deleteExperimentTag(params.id);
  return { data: { id: params.id } };
}
