import type { APIClient } from '../../api-client/api-client.js';
import type { DatasourceId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListDatasourcesParams {
  items?: number | undefined;
  page?: number | undefined;
}

export async function listDatasources(
  client: APIClient,
  params: ListDatasourcesParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listDatasources({ items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetDatasourceParams {
  id: DatasourceId;
}

export async function getDatasource(
  client: APIClient,
  params: GetDatasourceParams
): Promise<CommandResult<unknown>> {
  const data = await client.getDatasource(params.id);
  return { data };
}

export interface CreateDatasourceParams {
  config: Record<string, unknown>;
}

export async function createDatasource(
  client: APIClient,
  params: CreateDatasourceParams
): Promise<CommandResult<unknown>> {
  const data = await client.createDatasource(params.config);
  return { data };
}

export interface UpdateDatasourceParams {
  id: DatasourceId;
  config: Record<string, unknown>;
}

export async function updateDatasource(
  client: APIClient,
  params: UpdateDatasourceParams
): Promise<CommandResult<unknown>> {
  const data = await client.updateDatasource(params.id, params.config);
  return { data };
}

export interface ArchiveDatasourceParams {
  id: DatasourceId;
  unarchive?: boolean | undefined;
}

export async function archiveDatasource(
  client: APIClient,
  params: ArchiveDatasourceParams
): Promise<CommandResult<void>> {
  await client.archiveDatasource(params.id, params.unarchive);
  return { data: undefined };
}

export interface TestDatasourceParams {
  config: Record<string, unknown>;
}

export async function testDatasource(
  client: APIClient,
  params: TestDatasourceParams
): Promise<CommandResult<void>> {
  await client.testDatasource(params.config);
  return { data: undefined };
}

export interface IntrospectDatasourceParams {
  config: Record<string, unknown>;
}

export async function introspectDatasource(
  client: APIClient,
  params: IntrospectDatasourceParams
): Promise<CommandResult<unknown>> {
  const data = await client.introspectDatasource(params.config);
  return { data };
}

export interface ValidateDatasourceQueryParams {
  config: Record<string, unknown>;
}

export async function validateDatasourceQuery(
  client: APIClient,
  params: ValidateDatasourceQueryParams
): Promise<CommandResult<void>> {
  await client.validateDatasourceQuery(params.config);
  return { data: undefined };
}

export interface PreviewDatasourceQueryParams {
  config: Record<string, unknown>;
}

export async function previewDatasourceQuery(
  client: APIClient,
  params: PreviewDatasourceQueryParams
): Promise<CommandResult<unknown>> {
  const data = await client.previewDatasourceQuery(params.config);
  return { data };
}

export interface SetDefaultDatasourceParams {
  id: DatasourceId;
}

export async function setDefaultDatasource(
  client: APIClient,
  params: SetDefaultDatasourceParams
): Promise<CommandResult<void>> {
  await client.setDefaultDatasource(params.id);
  return { data: undefined };
}

export interface GetDatasourceSchemaParams {
  id: DatasourceId;
}

export async function getDatasourceSchema(
  client: APIClient,
  params: GetDatasourceSchemaParams
): Promise<CommandResult<unknown>> {
  const data = await client.getDatasourceSchema(params.id);
  return { data };
}

export interface DeleteDatasourceParams {
  id: DatasourceId;
}

export async function deleteDatasource(
  client: APIClient,
  params: DeleteDatasourceParams
): Promise<CommandResult<void>> {
  await client.deleteDatasource(params.id);
  return { data: undefined };
}

export interface CreateDatasourceJsonLayoutsParams {
  id: DatasourceId;
}

export async function createDatasourceJsonLayouts(
  client: APIClient,
  params: CreateDatasourceJsonLayoutsParams
): Promise<CommandResult<void>> {
  await client.createDatasourceJsonLayouts(params.id);
  return { data: undefined };
}

export interface RecreateDatasourceJsonLayoutsParams {
  id: DatasourceId;
}

export async function recreateDatasourceJsonLayouts(
  client: APIClient,
  params: RecreateDatasourceJsonLayoutsParams
): Promise<CommandResult<void>> {
  await client.recreateDatasourceJsonLayouts(params.id);
  return { data: undefined };
}

export interface PreviewDatasourceJsonLayoutsParams {
  id: DatasourceId;
}

export async function previewDatasourceJsonLayouts(
  client: APIClient,
  params: PreviewDatasourceJsonLayoutsParams
): Promise<CommandResult<unknown>> {
  const data = await client.previewDatasourceJsonLayouts(params.id);
  return { data };
}

export { columnarToRows } from '../events/events.js';
