export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface HttpClient {
  request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
  getBaseUrl?(): string;
  getAuthHeader?(): string;
}

export class APIError extends Error {
  statusCode?: number;
  response?: unknown;

  constructor(message: string, statusCode?: number, response?: unknown) {
    super(message);
    this.name = 'APIError';
    if (statusCode !== undefined) this.statusCode = statusCode;
    if (response !== undefined) this.response = response;
  }
}

export class DryRunError extends Error {
  readonly method: string;
  readonly url: string;

  constructor(method: string, url: string) {
    super(`Dry run: ${method} ${url} — request not sent`);
    this.name = 'DryRunError';
    this.method = method;
    this.url = url;
  }
}
