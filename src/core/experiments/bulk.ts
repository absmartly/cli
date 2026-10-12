import type { APIClient } from '../../api-client/api-client.js';
import type { CommandResult } from '../types.js';
import type { ExperimentId } from '../../lib/api/branded-types.js';
import { parseExperimentId } from '../../lib/utils/validators.js';
import { APIError, DryRunError } from '../../api-client/http-client.js';

const FATAL_STATUS_CODES = new Set([401, 403, 429]);

const FATAL_STATUS_MESSAGES: Record<number, string> = {
  401: 'Authentication failed (401 Unauthorized) — check your API key',
  403: 'Permission denied (403 Forbidden) — insufficient permissions for this operation',
  429: 'Rate limit exceeded (429 Too Many Requests) — try again later',
};

const CONCURRENCY_LIMIT = 5;

export interface BulkOperationParams {
  rawIds: string[];
  note?: string;
  stdinIds?: ExperimentId[];
  state?: string;
  app?: string;
}

export interface BulkResult {
  id: ExperimentId;
  name: string;
  success: boolean;
  dryRun?: boolean;
  error?: string;
}

export interface BulkOperationResult {
  results: BulkResult[];
  succeeded: number;
  failed: number;
  total: number;
}

export async function collectBulkIds(
  client: APIClient,
  rawIds: string[],
  options: {
    stdinIds?: ExperimentId[] | undefined;
    state?: string | undefined;
    app?: string | undefined;
  }
): Promise<ExperimentId[]> {
  if (options.stdinIds && options.stdinIds.length > 0) {
    return options.stdinIds;
  }

  if (rawIds.length > 0) {
    return rawIds.map((id) => parseExperimentId(id));
  }

  if (!options.state && !options.app) {
    throw new Error('Provide experiment IDs, --stdin, or use --state / --app filters');
  }

  const listOptions: Record<string, string> = {};
  if (options.state) listOptions.state = options.state;
  if (options.app) listOptions.application = options.app;

  const experiments = await client.listExperiments(listOptions);
  return experiments.map((e) => e.id);
}

export async function fetchBulkNames(
  client: APIClient,
  ids: ExperimentId[]
): Promise<Map<ExperimentId, string>> {
  const names = new Map<ExperimentId, string>();
  const queue = [...ids];

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!;
      try {
        const exp = await client.getExperiment(id);
        names.set(id, exp.name);
      } catch (err: unknown) {
        const status =
          (err as { statusCode?: number }).statusCode ?? (err as { status?: number }).status;
        if (status === 404) {
          names.set(id, `(unknown #${id})`);
        } else {
          throw err;
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, ids.length) }, () => worker());
  const results = await Promise.allSettled(workers);
  const firstRejection = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (firstRejection) {
    throw firstRejection.reason;
  }
  return names;
}

export async function runBulkOperation(
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  action: (id: ExperimentId) => Promise<unknown>
): Promise<CommandResult<BulkOperationResult>> {
  const results: BulkResult[] = [];
  const queue = [...ids];
  let abortMessage: string | null = null;

  async function worker() {
    while (queue.length > 0) {
      if (abortMessage !== null) return;

      const id = queue.shift()!;
      const name = names.get(id) ?? `#${id}`;
      try {
        await action(id);
        results.push({ id, name, success: true });
      } catch (err) {
        if (err instanceof DryRunError) {
          results.push({ id, name, success: true, dryRun: true });
          continue;
        }

        const statusCode = err instanceof APIError ? err.statusCode : undefined;

        if (statusCode !== undefined && FATAL_STATUS_CODES.has(statusCode)) {
          const fatalMessage = `${FATAL_STATUS_MESSAGES[statusCode]} — batch aborted`;
          abortMessage = fatalMessage;
          results.push({ id, name, success: false, error: fatalMessage });
          queue.length = 0; // drain remaining items so other workers stop
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        results.push({ id, name, success: false, error: message });
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, ids.length) }, () => worker());
  await Promise.all(workers);

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = ids.length - results.length;

  const warnings: string[] = [];
  if (abortMessage !== null) {
    warnings.push(`${abortMessage} (${skipped} operation(s) skipped)`);
  }

  return {
    data: {
      results,
      succeeded,
      failed,
      total: ids.length,
    },
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function bulkStart(
  client: APIClient,
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  note?: string
): Promise<CommandResult<BulkOperationResult>> {
  return runBulkOperation(ids, names, (id) => client.startExperiment(id, note));
}

export async function bulkStop(
  client: APIClient,
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  reason: string,
  note?: string
): Promise<CommandResult<BulkOperationResult>> {
  return runBulkOperation(ids, names, (id) => client.stopExperiment(id, reason, note));
}

export async function bulkArchive(
  client: APIClient,
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  note?: string
): Promise<CommandResult<BulkOperationResult>> {
  return runBulkOperation(ids, names, (id) => client.archiveExperiment(id, false, note));
}

export async function bulkDevelopment(
  client: APIClient,
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  note?: string
): Promise<CommandResult<BulkOperationResult>> {
  const effectiveNote = note ?? 'Bulk development via CLI';
  return runBulkOperation(ids, names, (id) => client.developmentExperiment(id, effectiveNote));
}

export async function bulkFullOn(
  client: APIClient,
  ids: ExperimentId[],
  names: Map<ExperimentId, string>,
  variant: number,
  note?: string
): Promise<CommandResult<BulkOperationResult>> {
  const effectiveNote = note ?? 'Bulk full-on via CLI';
  return runBulkOperation(ids, names, (id) => client.fullOnExperiment(id, variant, effectiveNote));
}
