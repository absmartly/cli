import type { APIClient } from '../../api-client/api-client.js';
import type { ExportConfigId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';

const DEFAULT_LIST_PAGE_SIZE = 20;

export interface ListExportConfigsParams {
  statuses?: string | undefined;
  items?: number | undefined;
  page?: number | undefined;
}

export async function listExportConfigs(
  client: APIClient,
  params: ListExportConfigsParams = {}
): Promise<CommandResult<unknown>> {
  const items = params.items ?? DEFAULT_LIST_PAGE_SIZE;
  const page = params.page ?? 1;
  const data = await client.listExportConfigs({ statuses: params.statuses, items, page });
  return { data, pagination: { page, items, hasMore: (data as unknown[]).length >= items } };
}

export interface GetExportConfigParams {
  id: ExportConfigId;
}

export async function getExportConfig(
  client: APIClient,
  params: GetExportConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.getExportConfig(params.id);
  return { data };
}

export interface CreateExportConfigParams {
  config: Record<string, unknown>;
}

export async function createExportConfig(
  client: APIClient,
  params: CreateExportConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.createExportConfig(params.config);
  return { data };
}

export interface UpdateExportConfigParams {
  id: ExportConfigId;
  config: Record<string, unknown>;
}

export async function updateExportConfig(
  client: APIClient,
  params: UpdateExportConfigParams
): Promise<CommandResult<unknown>> {
  const data = await client.updateExportConfig(params.id, params.config);
  return { data };
}

export interface ArchiveExportConfigParams {
  id: ExportConfigId;
  unarchive?: boolean | undefined;
}

export async function archiveExportConfig(
  client: APIClient,
  params: ArchiveExportConfigParams
): Promise<CommandResult<void>> {
  await client.archiveExportConfig(params.id, params.unarchive);
  return { data: undefined };
}

export interface PauseExportConfigParams {
  id: ExportConfigId;
}

export async function pauseExportConfig(
  client: APIClient,
  params: PauseExportConfigParams
): Promise<CommandResult<void>> {
  await client.pauseExportConfig(params.id);
  return { data: undefined };
}

export interface ListExportHistoriesParams {
  id: ExportConfigId;
}

export async function listExportHistories(
  client: APIClient,
  params: ListExportHistoriesParams
): Promise<CommandResult<unknown>> {
  const data = await client.listExportHistories(params.id);
  return { data };
}

export interface CancelExportHistoryParams {
  exportConfigId: ExportConfigId;
  historyId: number;
  reason?: string | undefined;
}

export async function cancelExportHistory(
  client: APIClient,
  params: CancelExportHistoryParams
): Promise<CommandResult<void>> {
  await client.cancelExportHistory(params.exportConfigId, params.historyId, params.reason);
  return { data: undefined };
}
