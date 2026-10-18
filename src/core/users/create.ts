import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import { resolveRolesPayload } from './filter.js';

export interface CreateUserParams {
  email: string;
  name: string;
  /** Comma-separated role names and/or numeric IDs for the global team. */
  role?: string | undefined;
}

export async function createUser(
  client: APIClient,
  params: CreateUserParams
): Promise<CommandResult<{ id: number }>> {
  const parts = params.name.split(' ');
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  const roles =
    params.role !== undefined ? await resolveRolesPayload(client, params.role) : undefined;
  const data = await client.createUser({
    email: params.email,
    first_name: firstName,
    last_name: lastName,
    ...(roles && { roles }),
  });
  return { data: data as { id: number } };
}
