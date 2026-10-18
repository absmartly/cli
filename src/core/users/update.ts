import type { APIClient } from '../../api-client/api-client.js';
import type { UserId } from '../../lib/api/branded-types.js';
import type { CommandResult } from '../types.js';
import { resolveRolesPayload } from './filter.js';

export interface UpdateUserParams {
  id: UserId;
  name?: string | undefined;
  /** Comma-separated role names and/or numeric IDs; replaces the global-team roles. */
  role?: string | undefined;
}

export async function updateUser(
  client: APIClient,
  params: UpdateUserParams
): Promise<CommandResult<void>> {
  const data: { first_name?: string; last_name?: string; roles?: Array<{ role_id: number }> } = {};
  if (params.name) {
    const parts = params.name.split(' ');
    data.first_name = parts[0] ?? '';
    data.last_name = parts.slice(1).join(' ');
  }
  if (params.role !== undefined) {
    data.roles = await resolveRolesPayload(client, params.role);
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one update field is required');
  }

  await client.updateUser(params.id, data);
  return { data: undefined };
}
