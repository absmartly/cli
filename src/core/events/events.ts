import type { APIClient } from '../../api-client/api-client.js';
import { formatDateTime } from '../../api-client/format-helpers.js';
import type { CommandResult } from '../types.js';

export function parseUnits(units: string[]): Array<{ unit_type_id: number; uid: string }> {
  const parsed: Array<{ unit_type_id: number; uid: string }> = [];
  for (const unit of units) {
    const colonIndex = unit.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid unit format: "${unit}". Expected format: unit_type_id:uid`);
    }
    const unitTypeId = Number(unit.slice(0, colonIndex));
    const uid = unit.slice(colonIndex + 1);
    if (isNaN(unitTypeId)) {
      throw new Error(`Invalid unit_type_id in "${unit}". Must be a number.`);
    }
    parsed.push({ unit_type_id: unitTypeId, uid });
  }
  return parsed;
}

export function columnarToRows(data: unknown): Record<string, unknown>[] {
  const d = data as { columnNames?: string[]; rows?: unknown[][] };
  if (!d || !Array.isArray(d.columnNames) || !Array.isArray(d.rows)) {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data !== null && data !== undefined && typeof data === 'object') {
      return [data as Record<string, unknown>];
    }
    return [];
  }
  const cols = d.columnNames;
  return d.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < cols.length; i++) obj[cols[i]!] = row[i];
    return obj;
  });
}

// Timestamp columns returned by the json-layouts/json-values endpoints as epoch
// milliseconds. Rendered as locale-/timezone-localized strings for the table,
// matching how created_at/updated_at are shown elsewhere (see entity-summary.ts).
const TIMESTAMP_COLUMNS = ['last_event_at', 'first_event_at'];

export function formatEventRowTimestamps(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out = { ...row };
    for (const col of TIMESTAMP_COLUMNS) {
      if (col in out && out[col] !== null && out[col] !== undefined) {
        out[col] = formatDateTime(out[col]);
      }
    }
    return out;
  });
}

const DEFAULT_EVENTS_TAKE = 100;

export interface ListEventsParams {
  from?: number | undefined;
  to?: number | undefined;
  applications?: number[] | undefined;
  unitTypes?: number[] | undefined;
  eventTypes?: string[] | undefined;
  eventNames?: string[] | undefined;
  unitUids?: string[] | undefined;
  environmentTypes?: string[] | undefined;
  validExposures?: boolean | undefined;
  take?: number | undefined;
  skip?: number | undefined;
}

export async function listEvents(
  client: APIClient,
  params: ListEventsParams
): Promise<CommandResult<unknown>> {
  const filters: Record<string, unknown> = {};
  if (params.from !== undefined) filters.from = params.from;
  if (params.to !== undefined) filters.to = params.to;
  if (params.applications && params.applications.length > 0)
    filters.applications = params.applications;
  if (params.unitTypes && params.unitTypes.length > 0) filters.unit_types = params.unitTypes;
  if (params.eventTypes && params.eventTypes.length > 0) filters.event_types = params.eventTypes;
  if (params.eventNames && params.eventNames.length > 0) filters.event_names = params.eventNames;
  if (params.unitUids && params.unitUids.length > 0) filters.unit_uids = params.unitUids;
  if (params.environmentTypes && params.environmentTypes.length > 0)
    filters.environment_types = params.environmentTypes;
  if (params.validExposures !== undefined) filters.effective_exposures = params.validExposures;

  const body: Record<string, unknown> = {};
  if (Object.keys(filters).length > 0) body.filters = filters;
  body.take = params.take ?? DEFAULT_EVENTS_TAKE;
  if (params.skip !== undefined) body.skip = params.skip;

  const data = await client.listEvents(body as Parameters<typeof client.listEvents>[0]);
  return { data };
}

export interface ListEventsHistoryParams {
  from?: number | undefined;
  to?: number | undefined;
  applications?: number[] | undefined;
  unitTypes?: number[] | undefined;
  eventTypes?: string[] | undefined;
  eventNames?: string[] | undefined;
  unitUids?: string[] | undefined;
  environmentTypes?: string[] | undefined;
  period?: string | undefined;
  tzOffset?: number | undefined;
}

export async function listEventsHistory(
  client: APIClient,
  params: ListEventsHistoryParams
): Promise<CommandResult<unknown>> {
  const filters: Record<string, unknown> = {};
  if (params.from !== undefined) filters.from = params.from;
  if (params.to !== undefined) filters.to = params.to;
  if (params.applications && params.applications.length > 0)
    filters.applications = params.applications;
  if (params.unitTypes && params.unitTypes.length > 0) filters.unit_types = params.unitTypes;
  if (params.eventTypes && params.eventTypes.length > 0) filters.event_types = params.eventTypes;
  if (params.eventNames && params.eventNames.length > 0) filters.event_names = params.eventNames;
  if (params.unitUids && params.unitUids.length > 0) filters.unit_uids = params.unitUids;
  if (params.environmentTypes && params.environmentTypes.length > 0)
    filters.environment_types = params.environmentTypes;

  const body: Record<string, unknown> = {};
  if (Object.keys(filters).length > 0) body.filters = filters;
  if (params.period !== undefined) body.period = params.period;
  if (params.tzOffset !== undefined) body.tz_offset = params.tzOffset;

  const data = await client.listEventsHistory(
    body as Parameters<typeof client.listEventsHistory>[0]
  );
  return { data };
}

export interface GetEventUnitDataParams {
  units: string[];
}

export async function getEventUnitData(
  client: APIClient,
  params: GetEventUnitDataParams
): Promise<CommandResult<unknown>> {
  const parsed = parseUnits(params.units);
  const data = await client.getEventUnitData({ units: parsed });
  return { data };
}

export interface DeleteEventUnitDataParams {
  units: string[];
}

export async function deleteEventUnitData(
  client: APIClient,
  params: DeleteEventUnitDataParams
): Promise<CommandResult<unknown>> {
  const parsed = parseUnits(params.units);
  const data = await client.deleteEventUnitData({ units: parsed });
  return { data };
}

export interface GetEventJsonValuesParams {
  eventType: string;
  path: string;
  experimentId?: number | undefined;
  goalId?: number | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

export async function getEventJsonValues(
  client: APIClient,
  params: GetEventJsonValuesParams
): Promise<CommandResult<unknown>> {
  const body: Record<string, unknown> = {
    event_type: params.eventType,
    path: params.path,
  };
  if (params.experimentId !== undefined) body.experiment_id = params.experimentId;
  if (params.goalId !== undefined) body.goal_id = params.goalId;
  if (params.from !== undefined) body.from = params.from;
  if (params.to !== undefined) body.to = params.to;

  const data = await client.getEventJsonValues(
    body as Parameters<typeof client.getEventJsonValues>[0]
  );
  return { data };
}

export interface GetEventJsonLayoutsParams {
  source: string;
  phase: string;
  prefix?: string | undefined;
  sourceId?: number | undefined;
  from?: number | undefined;
  to?: number | undefined;
}

export async function getEventJsonLayouts(
  client: APIClient,
  params: GetEventJsonLayoutsParams
): Promise<CommandResult<unknown>> {
  const body: Record<string, unknown> = {
    source: params.source,
    phase: params.phase,
  };
  if (params.prefix !== undefined) body.prefix = params.prefix;
  if (params.sourceId !== undefined) body.source_id = params.sourceId;
  if (params.from !== undefined) body.from = params.from;
  if (params.to !== undefined) body.to = params.to;

  const data = await client.getEventJsonLayouts(
    body as Parameters<typeof client.getEventJsonLayouts>[0]
  );
  return { data };
}
