import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';

export interface ListUsersParams {
  items?: number | undefined;
  page?: number | undefined;
  includeArchived?: boolean | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  sortAsc?: boolean | undefined;
  ids?: string | undefined;
}

export async function listUsers(
  client: APIClient,
  params: ListUsersParams
): Promise<CommandResult<unknown[]>> {
  const opts: {
    includeArchived?: boolean;
    items?: number;
    page?: number;
    search?: string;
    sort?: string;
    sort_asc?: boolean;
    ids?: string;
  } = {};
  if (params.includeArchived !== undefined) opts.includeArchived = params.includeArchived;
  if (params.items !== undefined) opts.items = params.items;
  if (params.page !== undefined) opts.page = params.page;
  if (params.search !== undefined) opts.search = params.search;
  if (params.sort !== undefined) opts.sort = params.sort;
  if (params.sortAsc !== undefined) opts.sort_asc = params.sortAsc;
  if (params.ids !== undefined) opts.ids = params.ids;
  const data = await client.listUsers(opts);
  return {
    data,
    pagination: {
      page: params.page ?? 1,
      items: params.items ?? 25,
      hasMore: data.length >= (params.items ?? 25),
    },
  };
}
