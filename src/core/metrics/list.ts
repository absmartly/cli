import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import { resolveOwnerIds, resolveTeamIds } from '../resolve.js';
import { summarizeMetricRow } from '../../api-client/entity-summary.js';

export { resolveOwnerIds, resolveTeamIds };

export interface ListMetricsParams {
  items: number;
  page: number;
  archived?: boolean | undefined;
  include_drafts?: boolean | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  sortAsc?: boolean | undefined;
  ids?: string | undefined;
  owners?: string | undefined;
  teams?: string | undefined;
  reviewStatus?: string | undefined;
}

export async function listMetrics(
  client: APIClient,
  params: ListMetricsParams
): Promise<CommandResult<unknown[]>> {
  const ownerIds = params.owners ? await resolveOwnerIds(client, params.owners) : undefined;
  const teamIds = params.teams ? await resolveTeamIds(client, params.teams) : undefined;

  const data = await client.listMetrics({
    items: params.items,
    page: params.page,
    archived: params.archived,
    include_drafts: params.include_drafts,
    search: params.search,
    sort: params.sort,
    sort_asc: params.sortAsc,
    ids: params.ids,
    owners: ownerIds,
    teams: teamIds,
    review_status: params.reviewStatus,
  });

  return {
    data,
    rows: (data as Array<Record<string, unknown>>).map(summarizeMetricRow),
    pagination: { page: params.page, items: params.items, hasMore: data.length >= params.items },
  };
}

const FETCH_ALL_PAGE_SIZE = 200;
const FETCH_ALL_MAX_PAGES = 100;

/**
 * Fetch every metric across all pages, resolving owners/teams a single time.
 * Used by `metrics list` when client-side filters are active so filtering sees
 * the full set rather than a single page.
 */
export async function listAllMetrics(
  client: APIClient,
  params: ListMetricsParams,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
  maxPages: number = FETCH_ALL_MAX_PAGES
): Promise<CommandResult<unknown[]>> {
  const ownerIds = params.owners ? await resolveOwnerIds(client, params.owners) : undefined;
  const teamIds = params.teams ? await resolveTeamIds(client, params.teams) : undefined;

  const all: unknown[] = [];
  // Stays true if we exhaust `maxPages` without seeing a short (final) page,
  // meaning there may be more metrics we did not fetch.
  let truncated = true;
  for (let page = 1; page <= maxPages; page++) {
    const data = await client.listMetrics({
      items: pageSize,
      page,
      archived: params.archived,
      include_drafts: params.include_drafts,
      search: params.search,
      sort: params.sort,
      sort_asc: params.sortAsc,
      ids: params.ids,
      owners: ownerIds,
      teams: teamIds,
      review_status: params.reviewStatus,
    });
    all.push(...data);
    if (data.length < pageSize) {
      truncated = false;
      break;
    }
  }

  // Don't silently drop metrics: warn (stderr) and report hasMore honestly when
  // the page cap is reached. Client-side filtering would otherwise look
  // complete while missing matches beyond the cap.
  if (truncated) {
    console.error(
      `Warning: reached the ${maxPages}-page fetch cap (${all.length} metrics); results may be incomplete. ` +
        'Narrow the set with server-side filters (--search, --owners, --teams, --ids) for complete client-side filtering.'
    );
  }

  return {
    data: all,
    pagination: { page: 1, items: all.length, hasMore: truncated },
  };
}
