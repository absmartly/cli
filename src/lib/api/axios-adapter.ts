import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import axiosRetry from 'axios-retry';
import { version } from '../utils/version.js';
import { APIError, DryRunError } from '../../api-client/http-client.js';
import type { HttpClient, HttpRequestConfig, HttpResponse } from '../../api-client/http-client.js';
import {
  formatRequestHTTP,
  formatRequestCurl,
  formatResponseHTTP,
  formatNetworkError,
  formatGenericError,
  formatSuppressionNotice,
  safeStringify,
  type FormatOptions,
} from './request-logger.js';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: { startTime: number; suppressed?: boolean };
  }
}

export interface AxiosHttpClientOptions {
  verbose?: boolean;
  timeout?: number;
  insecure?: boolean;
  showRequest?: boolean;
  showResponse?: boolean;
  curl?: boolean;
  showSecrets?: boolean;
  headersOnly?: boolean;
  statusOnly?: boolean;
  noColor?: boolean;
  dryRun?: boolean;
}

const DEFAULT_TIMEOUT = 30000;
const RETRY_COUNT = 3;

const NON_IDEMPOTENT_PUT_PATHS = ['/start', '/stop', '/restart', '/development', '/full_on'];

// POST endpoints that are read-only computations/lookups, not mutations.
// These stay reachable under --dry-run since blocking them would break
// commands like `datasources test`, `events list`, or `estimate-participants`
// that never write anything.
const DRY_RUN_SAFE_POST_PATHS = [
  '/datasources/test',
  '/datasources/introspect',
  '/datasources/validate_query',
  '/datasources/preview_query',
  '/json_layouts/preview',
  '/statistics/power/plan/matrix',
  '/events',
  '/events/history',
  '/events/unit_data',
  '/events/json_values',
  '/events/json_layouts',
  '/storage_configs/test',
];

function isDryRunSafe(method: string, url: string): boolean {
  if (method === 'GET') return true;
  if (method !== 'POST') return false;
  return DRY_RUN_SAFE_POST_PATHS.some((suffix) => url.endsWith(suffix));
}

const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

/**
 * Turn a Prisma-wrapped Postgres error into a readable summary.
 * Input looks like (whitespace collapsed for this comment):
 *   Invalid `prisma.metric.create()` invocation: ... ConnectorError { ...
 *     PostgresError { code: "23514", message: "new row for relation \"metrics\"
 *     violates check constraint \"chk_goal_ratio\"", severity: "ERROR",
 *     detail: Some("Failing row contains (...)"), column: None, hint: None }
 *     ... }
 *
 * Returns the Postgres `message` on its own line, followed by the `detail`
 * on a second line when present. Returns `undefined` when the input doesn't
 * look like a Prisma error, so the caller can fall back to the raw body.
 */
export function formatPrismaError(text: string): string | undefined {
  if (!text.includes('PostgresError') && !text.includes('prisma.')) return undefined;

  const message = extractRustString(text, /\bmessage:\s*"/);
  if (message === undefined) return undefined;

  const detail = extractRustString(text, /\bdetail:\s*Some\("/);
  return detail !== undefined ? `${message}\n${detail}` : message;
}

/**
 * Scan forward from the first match of `startRe` and return the contents of
 * the following Rust-debug-formatted double-quoted string, unescaping `\"`
 * and `\\` (the only escapes Rust's default Debug impl for &str emits).
 */
function extractRustString(text: string, startRe: RegExp): string | undefined {
  const match = startRe.exec(text);
  if (!match) return undefined;
  let i = match.index + match[0].length;
  let out = '';
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1]!;
      if (next === '"' || next === '\\') {
        out += next;
        i += 2;
        continue;
      }
      if (next === 'n') {
        out += '\n';
        i += 2;
        continue;
      }
      out += next;
      i += 2;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
    i += 1;
  }
  return undefined;
}

export type AuthConfig =
  | { method: 'api-key'; apiKey: string }
  | { method: 'oauth-jwt'; token: string; onExpired?: () => Promise<AuthConfig> };

function extractAuthValue(headers: unknown): string {
  if (!headers || typeof headers !== 'object') return '';
  const obj =
    typeof (headers as { toJSON?: () => unknown }).toJSON === 'function'
      ? ((headers as { toJSON: () => Record<string, unknown> }).toJSON() as Record<string, unknown>)
      : (headers as Record<string, unknown>);
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === 'authorization' && typeof v === 'string') return v;
  }
  return '';
}

export class AxiosHttpClient implements HttpClient {
  private client: AxiosInstance;
  private readonly verbose: boolean;
  private readonly showRequest: boolean;
  private readonly showResponse: boolean;
  private readonly curl: boolean;
  private readonly dryRun: boolean;
  private readonly formatOpts: FormatOptions;
  private seenFingerprints: Set<string> = new Set();
  private suppressedCount = 0;
  protected authConfig: AuthConfig;

  constructor(endpoint: string, auth: string | AuthConfig, options: AxiosHttpClientOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.showRequest = options.showRequest ?? false;
    this.showResponse = options.showResponse ?? false;
    this.curl = options.curl ?? false;
    this.dryRun = options.dryRun ?? false;
    this.formatOpts = {
      showSecrets: options.showSecrets ?? false,
      omitBody: options.headersOnly ?? false,
      statusOnly: options.statusOnly ?? false,
      color: !!process.stderr.isTTY && !(options.noColor ?? false),
    };

    this.authConfig = typeof auth === 'string' ? { method: 'api-key', apiKey: auth } : auth;

    const authHeader =
      this.authConfig.method === 'api-key'
        ? `Api-Key ${this.authConfig.apiKey}`
        : `Bearer ${this.authConfig.token}`;

    this.client = axios.create({
      baseURL: endpoint,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      ...(options.insecure && { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }),
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': `absmartly-cli/${version}`,
      },
    });

    axiosRetry(this.client, {
      retries: RETRY_COUNT,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        const method = error.config?.method?.toUpperCase();
        const url = error.config?.url ?? '';

        if (method === 'PUT' && NON_IDEMPOTENT_PUT_PATHS.some((p) => url.endsWith(p))) {
          return false;
        }

        const isIdempotent = IDEMPOTENT_METHODS.includes(method ?? '');
        if (!isIdempotent) return false;

        if (axiosRetry.isNetworkError(error)) return true;

        if (error.response?.status === 429) return true;

        return (error.response?.status ?? 0) >= 500;
      },
    });

    // Registered first on purpose: axios runs request interceptors in reverse
    // registration order, so the logging interceptors below run before this
    // one and --show-request/--curl still print the request that gets blocked.
    if (this.dryRun) {
      this.client.interceptors.request.use((config) => {
        const method = (config.method ?? 'GET').toUpperCase();
        const url = config.url ?? '';
        if (!isDryRunSafe(method, url)) {
          return Promise.reject(new DryRunError(method, url));
        }
        return config;
      });
    }

    if (this.verbose) {
      this.client.interceptors.request.use((config) => {
        console.error(`[DEBUG] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      });
    }

    // Request interceptor stamps startTime even when only --show-response is
    // set, so the response handler below can compute elapsed time.
    if (this.showRequest || this.curl || this.showResponse) {
      this.client.interceptors.request.use((config) => {
        config.metadata = { startTime: Date.now() };

        // Polling loops produce streams of repeating requests, often
        // alternating between several URLs. Track every fingerprint we've
        // already printed in this client and suppress any later request
        // (and its matching response) that matches one we've seen. The
        // first time a brand-new request comes through, flush a
        // "(N suppressed)" summary before printing it.
        //
        // This trades response visibility for noise reduction: state
        // changes that *only* show up in response bodies of otherwise-
        // identical requests will be hidden. Acceptable for typical CLI
        // debugging — the user can disable suppression by varying their
        // requests, or split into separate invocations.
        if (this.showRequest || this.curl || this.showResponse) {
          const fp = this.fingerprint(config);
          if (this.seenFingerprints.has(fp)) {
            this.suppressedCount++;
            config.metadata.suppressed = true;
            return config;
          }
          if (this.suppressedCount > 0) {
            process.stderr.write(
              formatSuppressionNotice(this.suppressedCount, this.formatOpts.color) + '\n'
            );
            this.suppressedCount = 0;
          }
          this.seenFingerprints.add(fp);

          if (this.showRequest) {
            process.stderr.write(formatRequestHTTP(config, this.formatOpts) + '\n');
          }
          if (this.curl) {
            process.stderr.write(formatRequestCurl(config, this.formatOpts) + '\n');
          }
        }
        return config;
      });
    }

    if (this.showResponse) {
      this.client.interceptors.response.use(
        (response) => {
          if (response.config.metadata?.suppressed) return response;
          const start = response.config.metadata?.startTime ?? Date.now();
          const elapsed = Date.now() - start;
          process.stderr.write(formatResponseHTTP(response, elapsed, this.formatOpts) + '\n');
          return response;
        },
        (error: unknown) => {
          if (error instanceof DryRunError) return Promise.reject(error);
          if (axios.isAxiosError(error)) {
            if (error.config?.metadata?.suppressed) return Promise.reject(error);
            const start = error.config?.metadata?.startTime ?? Date.now();
            const elapsed = Date.now() - start;
            if (error.response) {
              process.stderr.write(
                formatResponseHTTP(error.response, elapsed, this.formatOpts) + '\n'
              );
            } else {
              process.stderr.write(formatNetworkError(error, elapsed, this.formatOpts) + '\n');
            }
          } else {
            // Non-axios errors reach this handler when an upstream interceptor
            // (e.g. the OAuth refresh path below) wraps and rejects with a
            // custom error type. Without this branch --show-response would go
            // silent in those cases.
            process.stderr.write(formatGenericError(error, 0, this.formatOpts) + '\n');
          }
          return Promise.reject(error);
        }
      );
    }

    if (this.authConfig.method === 'oauth-jwt' && this.authConfig.onExpired) {
      const onExpired = this.authConfig.onExpired;
      let isRefreshing = false;

      this.client.interceptors.response.use(undefined, async (error: unknown) => {
        if (!axios.isAxiosError(error) || error.response?.status !== 401 || isRefreshing) {
          return Promise.reject(error);
        }

        isRefreshing = true;
        try {
          const newAuth = await onExpired();
          const newHeader =
            newAuth.method === 'api-key' ? `Api-Key ${newAuth.apiKey}` : `Bearer ${newAuth.token}`;

          this.client.defaults.headers.common['Authorization'] = newHeader;
          this.authConfig = newAuth;

          if (error.config) {
            error.config.headers['Authorization'] = newHeader;
            return this.client.request(error.config);
          }
        } catch (refreshError) {
          const refreshMsg =
            refreshError instanceof Error ? refreshError.message : String(refreshError);
          console.error(`Warning: Token refresh failed: ${refreshMsg}`);
          const wrappedError = new APIError(
            `Authentication failed: token refresh unsuccessful (${refreshMsg}).\n` +
              `Run: abs auth login`,
            401,
            error.response?.data
          );
          return Promise.reject(wrappedError);
        } finally {
          isRefreshing = false;
        }

        return Promise.reject(error);
      });
    }

    this.client.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error)) {
          throw this.handleError(error);
        }
        throw error;
      }
    );
  }

  private fingerprint(config: {
    method?: string;
    url?: string;
    params?: unknown;
    data?: unknown;
    headers?: unknown;
    'axios-retry'?: { retryCount?: number };
  }): string {
    const method = (config.method ?? 'GET').toUpperCase();
    const url = config.url ?? '';
    const params = config.params ? safeStringify(config.params) : '';
    const body = config.data ? safeStringify(config.data) : '';
    // Include the Authorization header so OAuth refresh retries (which change
    // the token) and the axios-retry retryCount so failed-then-retried
    // requests are not collapsed into the original.
    const auth = extractAuthValue(config.headers);
    const retry = config['axios-retry']?.retryCount ?? 0;
    return `${method}|${url}|${params}|${body}|${auth}|${retry}`;
  }

  async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const axiosConfig: Record<string, unknown> = {
      method: config.method,
      url: config.url,
    };

    if (config.headers !== undefined) {
      axiosConfig.headers = config.headers;
    }
    if (config.params !== undefined) {
      axiosConfig.params = config.params;
    }
    if (config.data !== undefined) {
      axiosConfig.data = config.data;
    }
    if (config.timeout !== undefined) {
      axiosConfig.timeout = config.timeout;
    }

    const response = await this.client.request(axiosConfig);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    return {
      status: response.status,
      data: response.data as T,
      headers,
    };
  }

  getBaseUrl(): string {
    return this.client.defaults.baseURL || '';
  }

  getAuthHeader(): string {
    const headers = this.client.defaults.headers;
    return (
      (headers.common?.['Authorization'] as string) ?? (headers['Authorization'] as string) ?? ''
    );
  }

  private handleError(error: AxiosError): APIError {
    const endpoint = error.config?.url || 'unknown endpoint';
    const method = error.config?.method?.toUpperCase() || 'unknown method';
    const status = error.response?.status;
    const responseData = error.response?.data as Record<string, unknown> | undefined;

    // Surface a human-readable body message from common error shapes.
    // The backend returns {errors: [...]} for validation failures (handled by
    // handleCommandError when the APIError reaches the command layer) and may
    // return {message: "..."} or a raw string for other errors.
    const rawBodyMessage = (() => {
      if (!responseData) return undefined;
      if (typeof responseData === 'string') return responseData;
      const msg = responseData.message ?? responseData.error ?? responseData.detail;
      return typeof msg === 'string' ? msg : undefined;
    })();

    // DB errors from Prisma come back with a long wrapper that buries the two
    // parts an operator actually needs: the Postgres `message` and `detail`.
    // When we recognise the shape, render just those so the user sees
    //   message: new row for relation "metrics" violates check constraint "chk_goal_ratio"
    //   detail: Failing row contains (...)
    // instead of the full ConnectorError/PostgresError debug dump.
    const bodyMessage = rawBodyMessage
      ? (formatPrismaError(rawBodyMessage) ?? rawBodyMessage)
      : undefined;

    // DB check-constraint failures (5xx) often bubble up cryptic Prisma text.
    // Detect the goal_ratio constraint and add a concrete hint.
    const constraintHint = (() => {
      const haystack = `${error.message ?? ''} ${rawBodyMessage ?? ''}`;
      if (haystack.includes('chk_goal_ratio')) {
        return (
          `Hint: goal_ratio needs consistent numerator/denominator fields. Verify\n` +
          `that goal_id/value_source_property match the numerator_type and that\n` +
          `denominator_goal_id/denominator_value_source_property match the\n` +
          `denominator_type. Empty strings are not equivalent to null.`
        );
      }
      return undefined;
    })();

    let message: string;
    switch (status) {
      case 401:
        message =
          `Unauthorized: Invalid or expired API key.\n` +
          `Endpoint: ${method} ${endpoint}\n` +
          `Run: abs auth login --api-key YOUR_KEY`;
        break;
      case 403:
        message =
          `Forbidden: Insufficient permissions for this operation.\n` +
          `Endpoint: ${method} ${endpoint}\n` +
          `Please check your API key has the required permissions.`;
        break;
      case 404:
        message = `Not found: Resource does not exist.\n` + `Endpoint: ${method} ${endpoint}`;
        break;
      case 429: {
        const retryAfter = error.response?.headers['retry-after'];
        message =
          `Rate limit exceeded.\n` +
          `Endpoint: ${method} ${endpoint}\n` +
          (retryAfter ? `Retry after: ${retryAfter} seconds` : 'Please try again later.');
        break;
      }
      default:
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          message =
            `Cannot connect to API server.\n` +
            `Endpoint: ${endpoint}\n` +
            `Please check your network connection and API endpoint configuration.`;
        } else if (error.code === 'ETIMEDOUT') {
          message =
            `Request timeout.\n` +
            `Endpoint: ${method} ${endpoint}\n` +
            `The server took too long to respond. Please try again.`;
        } else {
          const lines = [
            `API error: ${error.message || 'unknown error'}`,
            `Endpoint: ${method} ${endpoint}`,
          ];
          if (bodyMessage) lines.push('', bodyMessage);
          if (constraintHint) lines.push('', constraintHint);
          message = lines.join('\n');
        }
    }

    return new APIError(message, status, error.response?.data);
  }
}

export function createAxiosHttpClient(
  endpoint: string,
  auth: string | AuthConfig,
  options?: AxiosHttpClientOptions
): AxiosHttpClient {
  return new AxiosHttpClient(endpoint, auth, options);
}
