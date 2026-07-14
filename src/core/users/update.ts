import type { APIClient } from '../../api-client/api-client.js';
import type { UserId } from '../../lib/api/branded-types.js';
import type { UpdateUserData } from '../../api-client/types.js';
import type { CommandResult } from '../types.js';

export interface UpdateUserParams {
  id: UserId;
  name?: string | undefined;
  role?: string | undefined;
}

export async function updateUser(
  client: APIClient,
  params: UpdateUserParams
): Promise<CommandResult<void>> {
  const data: UpdateUserData = {};
  if (params.name) {
    const parts = params.name.split(' ');
    data.first_name = parts[0] ?? '';
    data.last_name = parts.slice(1).join(' ');
  }

  if (params.role !== undefined) {
    // The API expects roles as an array of { role_id } objects for the
    // global team (see UpdateUserBody in the OpenAPI schema and the backend
    // handler which does data.roles.map(({ role_id }) => ...)). A bare
    // number array is rejected. --role carries a single role ID.
    const roleId = Number(params.role);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      throw new Error(`Invalid role: "${params.role}" is not a valid role ID`);
    }
    data.roles = [{ role_id: roleId }];
  }

  if (Object.keys(data).length === 0) {
    throw new Error('At least one update field is required');
  }

  await client.updateUser(params.id, data);
  return { data: undefined };
}
