import { APIError } from './http-client.js';
import type { HttpClient, HttpRequestConfig, HttpResponse } from './http-client.js';
import { experimentToInput } from './experiment-transform.js';
import type { ExperimentInput } from './experiment-transform.js';
import { resolveBySearch } from './payload/search-resolver.js';
import { resolveByName } from './payload/resolver.js';
import { stripApiVersionPath } from '../lib/utils/url.js';
import { ExperimentId } from './types.js';
import type {
  Experiment,
  ListMetricsOptions,
  ListOptions,
  Goal,
  Segment,
  Team,
  User,
  Metric,
  Application,
  Environment,
  UnitType,
  Note,
  ExperimentTag,
  GoalTag,
  MetricTag,
  MetricCategory,
  Role,
  Permission,
  PermissionCategory,
  ApiKey,
  Webhook,
  ScheduledAction,
  GoalId,
  SegmentId,
  TeamId,
  UserId,
  MetricId,
  ApplicationId,
  EnvironmentId,
  UnitTypeId,
  NoteId,
  AlertId,
  TagId,
  RoleId,
  ApiKeyId,
  WebhookId,
  ScheduledActionId,
  CustomSectionField,
  CustomSectionFieldId,
  CustomSectionId,
  AnnotationId,
  AssetRole,
  AssetRoleId,
  CorsOriginId,
  DatasourceId,
  ExportConfigId,
  ExportConfigShape,
  ExportHistoryShape,
  UpdateScheduleId,
  Alert,
  RecommendedActionId,
} from './types.js';

function createAPIError(message: string, response?: HttpResponse): APIError {
  return new APIError(message, response?.status, response?.data);
}

export class APIClient {
  private httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
  }

  getApiBaseUrl(): string {
    return this.httpClient.getBaseUrl?.() ?? '';
  }

  getAuthHeader(): string {
    return this.httpClient.getAuthHeader?.() ?? '';
  }

  private getRootUrl(): string {
    const baseUrl = this.httpClient.getBaseUrl?.() ?? '';
    return stripApiVersionPath(baseUrl);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    options?: {
      params?: Record<string, string | number | boolean | undefined>;
      data?: unknown;
      headers?: Record<string, string>;
    }
  ): Promise<HttpResponse<T>> {
    const config: HttpRequestConfig = { method, url };
    if (options?.params) config.params = options.params;
    if (options?.data !== undefined) config.data = options.data;
    if (options?.headers) config.headers = options.headers;
    return this.httpClient.request<T>(config);
  }

  private validateListResponse<T>(
    response: HttpResponse,
    expectedKey: string,
    operation: string
  ): T[] {
    const data = response.data;

    if (!data || typeof data !== 'object') {
      throw new Error(
        `Invalid API response for ${operation}: Expected object, got ${typeof data}\n` +
          `This may indicate an API error or network proxy issue.`
      );
    }

    const items = (data as Record<string, unknown>)[expectedKey];

    if (items === undefined) {
      throw new Error(
        `Invalid API response for ${operation}: Missing "${expectedKey}" field\n` +
          `Response keys: ${Object.keys(data).join(', ')}\n` +
          `This may indicate an API version mismatch.`
      );
    }

    if (!Array.isArray(items)) {
      throw new Error(
        `Invalid API response for ${operation}: "${expectedKey}" must be an array, got ${typeof items}`
      );
    }

    return items as T[];
  }

  private validateOkResponse(response: HttpResponse, operation: string): void {
    const data = response.data as Record<string, unknown> | null;
    if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
      const errors: string[] = Array.isArray(data.errors) ? (data.errors as string[]) : [];
      throw createAPIError(
        `${operation} failed: ${errors.join(', ') || 'unknown error'}`,
        response
      );
    }
  }

  private validateEntityResponse<T>(
    response: HttpResponse,
    expectedKey: string,
    operation: string
  ): T {
    const data = response.data;

    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid API response for ${operation}: Expected object, got ${typeof data}`);
    }

    const entity = (data as Record<string, unknown>)[expectedKey];

    if (entity === undefined) {
      throw new Error(
        `Invalid API response for ${operation}: Missing "${expectedKey}" field\n` +
          `Response keys: ${Object.keys(data).join(', ')}`
      );
    }

    return entity as T;
  }

  async listExperiments(options: ListOptions = {}): Promise<Experiment[]> {
    const params: Record<string, string> = {};

    if (options.page !== undefined) params.page = String(options.page);
    if (options.items !== undefined) params.items = String(options.items);
    if (options.sort) params.sort = options.sort;
    if (options.ascending !== undefined) params.sort_asc = String(options.ascending);
    if (options.select) params.select = options.select;
    if (options.include) params.include = options.include;
    if (options.previews) params.previews = '1';
    if (options.applications) params.applications = options.applications;
    if (options.application) params.application = options.application;
    if (options.status) params.status = options.status;
    if (options.state) params.state = options.state;
    if (options.type) params.type = options.type;
    if (options.unit_types) params.unit_types = options.unit_types;
    if (options.owners) params.owners = options.owners;
    if (options.teams) params.teams = options.teams;
    if (options.tags) params.tags = options.tags;
    if (options.templates) params.templates = options.templates;
    if (options.ids) params.ids = options.ids;
    if (options.impact) params.impact = options.impact;
    if (options.confidence) params.confidence = options.confidence;
    if (options.iterations !== undefined) params.iterations = String(options.iterations);
    if (options.iterations_of !== undefined) params.iterations_of = String(options.iterations_of);

    if (options.created_at) params.created_at = options.created_at;
    else if (options.created_after !== undefined || options.created_before !== undefined) {
      params.created_at = `${options.created_after ?? 0},${options.created_before ?? 0}`;
    }
    if (options.updated_at) params.updated_at = options.updated_at;
    if (options.started_at) params.started_at = options.started_at;
    else if (options.started_after !== undefined || options.started_before !== undefined) {
      params.started_at = `${options.started_after ?? 0},${options.started_before ?? 0}`;
    }
    if (options.stopped_at) params.stopped_at = options.stopped_at;
    else if (options.stopped_after !== undefined || options.stopped_before !== undefined) {
      params.stopped_at = `${options.stopped_after ?? 0},${options.stopped_before ?? 0}`;
    }
    if (options.full_on_at) params.full_on_at = options.full_on_at;

    if (options.analysis_type) params.analysis_type = options.analysis_type;
    if (options.running_type) params.running_type = options.running_type;
    if (options.search) params.search = options.search;

    if (options.alert_srm !== undefined) params.sample_ratio_mismatch = String(options.alert_srm);
    if (options.alert_cleanup_needed !== undefined)
      params.cleanup_needed = String(options.alert_cleanup_needed);
    if (options.alert_audience_mismatch !== undefined)
      params.audience_mismatch = String(options.alert_audience_mismatch);
    if (options.alert_sample_size_reached !== undefined)
      params.sample_size_reached = String(options.alert_sample_size_reached);
    if (options.alert_experiments_interact !== undefined)
      params.experiments_interact = String(options.alert_experiments_interact);
    if (options.alert_group_sequential_updated !== undefined)
      params.group_sequential_updated = String(options.alert_group_sequential_updated);
    if (options.alert_assignment_conflict !== undefined)
      params.assignment_conflict = String(options.alert_assignment_conflict);
    if (options.alert_metric_threshold_reached !== undefined)
      params.metric_threshold_reached = String(options.alert_metric_threshold_reached);

    if (options.significance) params.significance = options.significance;

    const response = await this.request('GET', '/experiments', { params });
    return this.validateListResponse<Experiment>(response, 'experiments', 'listExperiments');
  }

  async getExperiment(id: ExperimentId): Promise<Experiment> {
    const response = await this.request('GET', `/experiments/${id}`);
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'getExperiment');
  }

  async createExperiment(data: Partial<Experiment>): Promise<Experiment> {
    const response = await this.request('POST', '/experiments', { data });
    this.validateOkResponse(response, 'createExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'createExperiment');
  }

  async updateExperiment(
    id: ExperimentId,
    changes: Partial<ExperimentInput>,
    options?: { note?: string; update_metric_versions?: boolean }
  ): Promise<Experiment> {
    const experiment = await this.getExperiment(id);
    const input = experimentToInput(experiment);
    const merged = { ...input, ...changes };
    const payload: Record<string, unknown> = {
      id: experiment.id,
      data: merged,
    };
    if (options?.note !== undefined) payload.note = options.note;
    if (options?.update_metric_versions !== undefined)
      payload.update_metric_versions = options.update_metric_versions;
    const response = await this.request('PUT', `/experiments/${id}`, { data: payload });
    this.validateOkResponse(response, 'updateExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'updateExperiment');
  }

  async startExperiment(id: ExperimentId, note?: string): Promise<Experiment> {
    const response = await this.request('PUT', `/experiments/${id}/start`, {
      data: { ...(note !== undefined && { note }) },
    });
    this.validateOkResponse(response, 'startExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'startExperiment');
  }

  async stopExperiment(id: ExperimentId, reason: string, note?: string): Promise<Experiment> {
    const response = await this.request('PUT', `/experiments/${id}/stop`, {
      data: { reason, ...(note !== undefined && { note }) },
    });
    this.validateOkResponse(response, 'stopExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'stopExperiment');
  }

  async archiveExperiment(id: ExperimentId, unarchive = false, note?: string): Promise<void> {
    await this.request('PUT', `/experiments/${id}/archive`, {
      data: { archive: !unarchive, ...(note !== undefined && { note }) },
    });
  }

  async getParentExperiment(id: ExperimentId): Promise<Experiment> {
    const response = await this.request('GET', `/experiments/${id}/parent`);
    return this.validateEntityResponse<Experiment>(
      response,
      'parent_experiment',
      'getParentExperiment'
    );
  }

  async developmentExperiment(id: ExperimentId, note?: string): Promise<Experiment> {
    const response = await this.request('PUT', `/experiments/${id}/development`, {
      data: { ...(note !== undefined && { note }) },
    });
    this.validateOkResponse(response, 'developmentExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'developmentExperiment');
  }

  async restartExperiment(
    id: ExperimentId,
    options: {
      note?: string;
      reason?: string;
      reshuffle?: boolean;
      state?: 'development' | 'running';
      restart_as_type?: 'feature' | 'experiment';
      changes?: Partial<ExperimentInput>;
    } = {}
  ): Promise<Experiment> {
    const current = await this.getExperiment(id);
    const input = experimentToInput(current);
    const data: Record<string, unknown> = options.changes
      ? { ...input, ...options.changes }
      : { ...input };

    if (options.restart_as_type) {
      const dbType = options.restart_as_type === 'experiment' ? 'test' : options.restart_as_type;
      data.type = dbType;
      if (dbType === 'feature') {
        data.analysis_type = null;
        data.required_alpha = null;
        data.required_power = null;
        data.group_sequential_futility_type = null;
        data.group_sequential_analysis_count = null;
        data.group_sequential_min_analysis_interval = null;
        data.group_sequential_first_analysis_interval = null;
        data.group_sequential_max_duration_interval = null;
        data.minimum_detectable_effect = null;
        data.baseline_primary_metric_mean = null;
        data.baseline_primary_metric_stdev = null;
        data.baseline_participants_per_day = null;
      } else if (dbType === 'test' && !data.analysis_type) {
        data.analysis_type = 'group_sequential';
        data.required_alpha = '0.1';
        data.required_power = '0.8';
        data.group_sequential_futility_type = 'binding';
        data.group_sequential_min_analysis_interval = '1d';
        data.group_sequential_first_analysis_interval = '7d';
        data.group_sequential_max_duration_interval = '6w';
      }
    }

    const payload: Record<string, unknown> = {
      data,
      version: Date.now(),
      state: options.state ?? 'running',
      reshuffle: options.reshuffle ?? false,
    };
    if (options.note !== undefined) payload.note = options.note;
    if (options.reason !== undefined) payload.reason = options.reason;
    if (options.restart_as_type !== undefined) payload.restart_as_type = options.restart_as_type;

    const response = await this.request<Record<string, unknown>>(
      'PUT',
      `/experiments/${id}/restart`,
      { data: payload }
    );
    this.validateOkResponse(response, 'restartExperiment');
    const responseData = response.data;
    const experiment = responseData.new_experiment ?? responseData.experiment;
    if (!experiment) {
      throw new Error(
        `Invalid API response for restartExperiment: Missing "new_experiment" or "experiment" field\n` +
          `Response keys: ${Object.keys(responseData).join(', ')}`
      );
    }
    return experiment as Experiment;
  }

  async fullOnExperiment(
    id: ExperimentId,
    fullOnVariant: number,
    note?: string
  ): Promise<Experiment> {
    const response = await this.request('PUT', `/experiments/${id}/full_on`, {
      data: { full_on_variant: fullOnVariant, ...(note !== undefined && { note }) },
    });
    this.validateOkResponse(response, 'fullOnExperiment');
    return this.validateEntityResponse<Experiment>(response, 'experiment', 'fullOnExperiment');
  }

  async createScheduledAction(
    id: ExperimentId,
    action: string,
    scheduledAt: string,
    note: string,
    reason?: string
  ): Promise<ScheduledAction> {
    const body: Record<string, unknown> = { action, scheduled_at: scheduledAt, note };
    if (reason) body.reason = reason;
    const response = await this.request('POST', `/experiments/${id}/scheduled_action`, {
      data: body,
    });
    return this.validateEntityResponse<ScheduledAction>(
      response,
      'scheduled_action',
      'createScheduledAction'
    );
  }

  async deleteScheduledAction(id: ExperimentId, actionId: ScheduledActionId): Promise<void> {
    await this.request('DELETE', `/experiments/${id}/scheduled_action/${actionId}`);
  }

  async listExperimentMetrics(id: ExperimentId): Promise<unknown[]> {
    const response = await this.request('GET', `/experiments/${id}/metrics`);
    return this.validateListResponse<unknown>(
      response,
      'experiment_metrics',
      'listExperimentMetrics'
    );
  }

  async getExperimentMetricData(
    experimentId: ExperimentId,
    metricId: number | 'main',
    body?: {
      segment_id?: number;
      segment_source?: string;
      filters?: {
        segments?: string;
        from?: number;
        to?: number;
      };
    }
  ): Promise<{ columnNames: string[]; rows: unknown[][] }> {
    const response = await this.request<Record<string, unknown>>(
      'POST',
      `/experiments/${experimentId}/metrics/${metricId}`,
      {
        ...(body && { data: body }),
      }
    );
    const data = response.data;
    if (!data || !Array.isArray(data.columnNames) || !Array.isArray(data.rows)) {
      throw new Error(
        `Invalid metric data response for experiment ${experimentId}, metric ${metricId}`
      );
    }
    return data as { columnNames: string[]; rows: unknown[][] };
  }

  async estimateMaxParticipants(params: {
    from: number;
    unit_type_id: number;
    applications?: number[];
    audience?: string;
  }): Promise<{ columnNames: string[]; columnTypes: string[]; rows: unknown[][] }> {
    const response = await this.request<Record<string, unknown>>(
      'POST',
      '/experiments/estimate/max_participants',
      { data: params }
    );
    const data = response.data;
    if (!data || typeof data !== 'object') {
      throw createAPIError(
        `estimateMaxParticipants: expected object response, got ${typeof data}`,
        response
      );
    }
    if (!Array.isArray(data.columnNames)) {
      throw createAPIError(
        `estimateMaxParticipants: missing or invalid "columnNames". Response keys: ${Object.keys(data).join(', ')}`,
        response
      );
    }
    if (!Array.isArray(data.rows)) {
      throw createAPIError(
        `estimateMaxParticipants: missing or invalid "rows". Response keys: ${Object.keys(data).join(', ')}`,
        response
      );
    }
    return data as { columnNames: string[]; columnTypes: string[]; rows: unknown[][] };
  }

  async getExperimentMetricsCached(experimentId: ExperimentId): Promise<{
    columnNames: string[];
    rows: unknown[][];
    snapshot_data?: Record<string, unknown>;
    pending_update_request?: Record<string, unknown>;
  }> {
    const response = await this.request<Record<string, unknown>>(
      'GET',
      `/experiments/${experimentId}/metrics/main`,
      {
        params: { use_cache: '1' },
      }
    );
    const data = response.data;
    if (!data || !Array.isArray(data.columnNames) || !Array.isArray(data.rows)) {
      throw new Error(
        `No cached metric data available for experiment ${experimentId}. The previewer may not have processed this experiment yet.`
      );
    }
    return data as {
      columnNames: string[];
      rows: unknown[][];
      snapshot_data?: Record<string, unknown>;
      pending_update_request?: Record<string, unknown>;
    };
  }

  async addExperimentMetrics(id: ExperimentId, metricIds: MetricId[]): Promise<void> {
    const response = await this.request('POST', `/experiments/${id}/metrics`, {
      data: { metric_ids: metricIds },
    });
    this.validateOkResponse(response, 'addExperimentMetrics');
  }

  async confirmMetricImpact(experimentId: ExperimentId, metricId: MetricId): Promise<void> {
    const response = await this.request(
      'POST',
      `/experiments/${experimentId}/metrics/${metricId}/confirm_impact`
    );
    this.validateOkResponse(response, 'confirmMetricImpact');
  }

  async excludeExperimentMetric(experimentId: ExperimentId, metricId: MetricId): Promise<void> {
    const response = await this.request(
      'POST',
      `/experiments/${experimentId}/metrics/${metricId}/exclude`
    );
    this.validateOkResponse(response, 'excludeExperimentMetric');
  }

  async includeExperimentMetric(experimentId: ExperimentId, metricId: MetricId): Promise<void> {
    const response = await this.request(
      'POST',
      `/experiments/${experimentId}/metrics/${metricId}/include`
    );
    this.validateOkResponse(response, 'includeExperimentMetric');
  }

  async removeMetricImpact(experimentId: ExperimentId, metricId: MetricId): Promise<void> {
    const response = await this.request(
      'POST',
      `/experiments/${experimentId}/metrics/${metricId}/remove_impact`
    );
    this.validateOkResponse(response, 'removeMetricImpact');
  }

  async listExperimentActivity(id: ExperimentId): Promise<Note[]> {
    const response = await this.request('GET', `/experiments/${id}/activity`);
    return this.validateListResponse<Note>(response, 'experiment_notes', 'listExperimentActivity');
  }

  async createExperimentNote(id: ExperimentId, note: string): Promise<Note> {
    const response = await this.request('POST', `/experiments/${id}/activity`, { data: { note } });
    return this.validateEntityResponse<Note>(response, 'experiment_note', 'createExperimentNote');
  }

  async editExperimentNote(id: ExperimentId, noteId: NoteId, note: string): Promise<Note> {
    const response = await this.request('PUT', `/experiments/${id}/activity/${noteId}`, {
      data: { note },
    });
    this.validateOkResponse(response, 'editExperimentNote');
    return this.validateEntityResponse<Note>(response, 'experiment_note', 'editExperimentNote');
  }

  async replyToExperimentNote(id: ExperimentId, noteId: NoteId, note: string): Promise<Note> {
    const response = await this.request('POST', `/experiments/${id}/activity/${noteId}/reply`, {
      data: { note },
    });
    this.validateOkResponse(response, 'replyToExperimentNote');
    return this.validateEntityResponse<Note>(response, 'experiment_note', 'replyToExperimentNote');
  }

  async exportExperimentData(id: ExperimentId): Promise<ExportConfigShape> {
    const response = await this.request('POST', `/experiments/${id}/export_data`, { data: {} });
    this.validateOkResponse(response, 'exportExperimentData');
    return this.validateEntityResponse<ExportConfigShape>(
      response,
      'exportConfig',
      'exportExperimentData'
    );
  }

  async requestExperimentUpdate(
    id: ExperimentId,
    params?: { replaceGroupSequentialAnalysis?: boolean; tasks?: string[] }
  ): Promise<void> {
    const data: Record<string, unknown> = {};
    if (params) data.params = params;
    const response = await this.request('POST', `/experiments/${id}/request_update`, { data });
    this.validateOkResponse(response, 'requestExperimentUpdate');
  }

  async searchExperiments(query: string, items = 50): Promise<Experiment[]> {
    return this.listExperiments({ search: query, items });
  }

  async resolveExperimentId(nameOrId: string): Promise<ExperimentId> {
    const asInt = parseInt(nameOrId, 10);
    if (!isNaN(asInt) && String(asInt) === nameOrId.trim()) {
      return ExperimentId(asInt);
    }
    const results = await this.searchExperiments(nameOrId);
    const exact = results.filter((e) => e.name === nameOrId);
    if (exact.length >= 1) {
      exact.sort((a, b) => b.id - a.id);
      if (exact.length > 1) {
        const matches = exact.map((e) => `  ${e.id} (${e.state ?? 'unknown'})`).join('\n');
        console.error(
          `Warning: ${exact.length} experiments match name "${nameOrId}":\n${matches}\n` +
            `Using most recent: id ${exact[0]!.id}. Use a numeric ID to avoid ambiguity.`
        );
      }
      return exact[0]!.id;
    }
    if (results.length === 1) return results[0]!.id;
    if (results.length > 1) {
      const suggestions = results
        .slice(0, 5)
        .map((e) => `  ${e.id} ${e.name} (${e.state})`)
        .join('\n');
      throw new Error(`No exact match for "${nameOrId}". Did you mean:\n${suggestions}`);
    }
    throw new Error(`Experiment "${nameOrId}" not found`);
  }

  async listExperimentAlerts(experimentId?: ExperimentId): Promise<Alert[]> {
    const params: Record<string, string> = {};
    if (experimentId !== undefined) params.experiment_id = String(experimentId);
    const response = await this.request('GET', '/experiment_alerts', { params });
    return this.validateListResponse<Alert>(response, 'experiment_alerts', 'listExperimentAlerts');
  }

  async dismissAlert(id: AlertId): Promise<void> {
    const response = await this.request('PUT', `/experiment_alerts/${id}/dismiss`);
    this.validateOkResponse(response, 'dismissAlert');
  }

  async listRecommendedActions(experimentId?: ExperimentId): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (experimentId !== undefined) params.experiment_id = String(experimentId);
    const response = await this.request('GET', '/experiment_recommended_actions', { params });
    return this.validateListResponse<unknown>(
      response,
      'experiment_recommended_actions',
      'listRecommendedActions'
    );
  }

  async dismissRecommendedAction(id: RecommendedActionId): Promise<void> {
    const response = await this.request('PUT', `/experiment_recommended_actions/${id}/dismiss`);
    this.validateOkResponse(response, 'dismissRecommendedAction');
  }

  async listGoals(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Goal[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/goals', { params });
    return this.validateListResponse<Goal>(response, 'goals', 'listGoals');
  }

  async getGoal(id: GoalId): Promise<Goal> {
    const response = await this.request('GET', `/goals/${id}`);
    return this.validateEntityResponse<Goal>(response, 'goal', 'getGoal');
  }

  async createGoal(data: Partial<Goal>): Promise<Goal> {
    const response = await this.request('POST', '/goals', { data });
    return this.validateEntityResponse<Goal>(response, 'goal', 'createGoal');
  }

  async updateGoal(id: GoalId, data: Partial<Goal>): Promise<Goal> {
    const response = await this.request('PUT', `/goals/${id}`, { data: { data } });
    return this.validateEntityResponse<Goal>(response, 'goal', 'updateGoal');
  }

  async listSegments(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Segment[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/segments', { params });
    return this.validateListResponse<Segment>(response, 'segments', 'listSegments');
  }

  async getSegment(id: SegmentId): Promise<Segment> {
    const response = await this.request('GET', `/segments/${id}`);
    return this.validateEntityResponse<Segment>(response, 'segment', 'getSegment');
  }

  async createSegment(data: Partial<Segment>): Promise<Segment> {
    const response = await this.request('POST', '/segments', { data });
    return this.validateEntityResponse<Segment>(response, 'segment', 'createSegment');
  }

  async updateSegment(id: SegmentId, data: Partial<Segment>): Promise<Segment> {
    const response = await this.request('PUT', `/segments/${id}`, { data: { data } });
    return this.validateEntityResponse<Segment>(response, 'segment', 'updateSegment');
  }

  async deleteSegment(id: SegmentId): Promise<void> {
    await this.request('DELETE', `/segments/${id}`);
  }

  async listTeams(
    options: {
      includeArchived?: boolean;
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Team[]> {
    const params: Record<string, string> = {};
    if (options.includeArchived || options.archived) params.include_archived = '1';
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/teams', { params });
    return this.validateListResponse<Team>(response, 'teams', 'listTeams');
  }

  async getTeam(id: TeamId): Promise<Team> {
    const response = await this.request('GET', `/teams/${id}`);
    return this.validateEntityResponse<Team>(response, 'team', 'getTeam');
  }

  async createTeam(data: Partial<Team>): Promise<Team> {
    const response = await this.request('POST', '/teams', { data });
    return this.validateEntityResponse<Team>(response, 'team', 'createTeam');
  }

  async updateTeam(id: TeamId, data: Partial<Team>): Promise<Team> {
    const response = await this.request('PUT', `/teams/${id}`, { data: { data } });
    return this.validateEntityResponse<Team>(response, 'team', 'updateTeam');
  }

  async archiveTeam(id: TeamId, unarchive = false): Promise<void> {
    await this.request('PUT', `/teams/${id}/archive`, { data: { archive: !unarchive } });
  }

  async listUsers(
    options: {
      includeArchived?: boolean;
      search?: string;
      sort?: string;
      sort_asc?: boolean;
      ids?: string;
      items?: number;
      page?: number;
    } = {}
  ): Promise<User[]> {
    const params: Record<string, string> = {
      items: String(options.items ?? 100),
      page: String(options.page ?? 1),
    };
    if (options.includeArchived) params.include_archived = '1';
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/users', { params });
    return this.validateListResponse<User>(response, 'users', 'listUsers');
  }

  async getUser(id: UserId): Promise<User> {
    const response = await this.request('GET', `/users/${id}`);
    return this.validateEntityResponse<User>(response, 'user', 'getUser');
  }

  async createUser(data: Partial<User>): Promise<User> {
    const response = await this.request('POST', '/users', { data });
    return this.validateEntityResponse<User>(response, 'user', 'createUser');
  }

  async updateUser(id: UserId, data: Partial<User>): Promise<User> {
    const response = await this.request('PUT', `/users/${id}`, { data: { data } });
    return this.validateEntityResponse<User>(response, 'user', 'updateUser');
  }

  async archiveUser(id: UserId, unarchive = false): Promise<void> {
    await this.request('PUT', `/users/${id}/archive`, { data: { archive: !unarchive } });
  }

  async resetUserPassword(id: UserId): Promise<{ password: string }> {
    const response = await this.request('PUT', `/users/${id}/reset-password`);
    this.validateOkResponse(response, 'resetUserPassword');
    const data = response.data as { password: string };
    return { password: data.password };
  }

  async listUserApiKeysByUserId(userId: UserId, items = 20, page = 1): Promise<unknown[]> {
    const response = await this.request('GET', `/users/${userId}/api_keys`, {
      params: { items: String(items), page: String(page) },
    });
    return this.validateListResponse<unknown>(response, 'user_api_keys', 'listUserApiKeysByUserId');
  }

  async getUserApiKeyByUserId(userId: UserId, keyId: number): Promise<unknown> {
    const response = await this.request('GET', `/users/${userId}/api_keys/${keyId}`);
    return this.validateEntityResponse<unknown>(response, 'user_api_key', 'getUserApiKeyByUserId');
  }

  async createUserApiKeyByUserId(
    userId: UserId,
    data: { name: string; description?: string }
  ): Promise<{ id: number; name: string; key: string }> {
    const response = await this.request<Record<string, unknown>>(
      'POST',
      `/users/${userId}/api_keys`,
      {
        data: { name: data.name, description: data.description || '' },
      }
    );
    return this.validateEntityResponse<{ id: number; name: string; key: string }>(
      response,
      'user_api_key',
      'createUserApiKeyByUserId'
    );
  }

  async updateUserApiKeyByUserId(
    userId: UserId,
    keyId: number,
    data: { name?: string; description?: string }
  ): Promise<unknown> {
    const response = await this.request('PUT', `/users/${userId}/api_keys/${keyId}`, {
      data: { data },
    });
    return this.validateEntityResponse<unknown>(
      response,
      'user_api_key',
      'updateUserApiKeyByUserId'
    );
  }

  async deleteUserApiKeyByUserId(userId: UserId, keyId: number): Promise<void> {
    await this.request('DELETE', `/users/${userId}/api_keys/${keyId}`);
  }

  async listMetrics(options: ListMetricsOptions = {}): Promise<Metric[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.archived) params.archived = 'true';
    if (options.include_drafts) params.include_drafts = 'true';
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.ids) params.ids = options.ids;
    if (options.owners) params.owners = options.owners;
    if (options.teams) params.teams = options.teams;
    if (options.review_status) params.review_status = options.review_status;
    const response = await this.request('GET', '/metrics', { params });
    return this.validateListResponse<Metric>(response, 'metrics', 'listMetrics');
  }

  async getMetric(id: MetricId): Promise<Metric> {
    const response = await this.request('GET', `/metrics/${id}`);
    return this.validateEntityResponse<Metric>(response, 'metric', 'getMetric');
  }

  async listMetricUsages(): Promise<unknown[]> {
    const response = await this.request('GET', '/metrics/usages');
    return this.validateListResponse<unknown>(response, 'metrics', 'listMetricUsages');
  }

  async createMetric(data: Partial<Metric>): Promise<Metric> {
    const response = await this.request('POST', '/metrics', { data });
    return this.validateEntityResponse<Metric>(response, 'metric', 'createMetric');
  }

  async updateMetric(id: MetricId, data: Partial<Metric>): Promise<Metric> {
    const response = await this.request('PUT', `/metrics/${id}`, { data: { data } });
    return this.validateEntityResponse<Metric>(response, 'metric', 'updateMetric');
  }

  async getCurrentUser(): Promise<User> {
    const rootUrl = this.getRootUrl();
    const response = await this.request('GET', `${rootUrl}/auth/current-user`);
    const user = this.validateEntityResponse<User>(response, 'user', 'getCurrentUser');
    if (user.avatar_file_upload_id && !user.avatar) {
      return this.getUser(user.id);
    }
    return user;
  }

  async createUserApiKey(
    name: string,
    description?: string
  ): Promise<{ id: number; name: string; key: string }> {
    const rootUrl = this.getRootUrl();
    const response = await this.request<Record<string, unknown>>(
      'POST',
      `${rootUrl}/auth/current-user/api_keys`,
      {
        data: { name, description: description || '' },
      }
    );
    return this.validateEntityResponse<{ id: number; name: string; key: string }>(
      response,
      'user_api_key',
      'createUserApiKey'
    );
  }

  async activateMetric(id: MetricId, reason: string): Promise<Metric> {
    const response = await this.request('PUT', `/metrics/${id}/activate`, { data: { reason } });
    return this.validateEntityResponse<Metric>(response, 'metric', 'activateMetric');
  }

  async createMetricVersion(id: MetricId, data: Partial<Metric>, reason?: string): Promise<Metric> {
    const payload: Record<string, unknown> = { data };
    if (reason !== undefined) payload.reason = reason;
    const response = await this.request('POST', `/metrics/${id}/version`, { data: payload });
    return this.validateEntityResponse<Metric>(response, 'metric', 'createMetricVersion');
  }

  async archiveMetric(id: MetricId, unarchive = false): Promise<void> {
    await this.request('PUT', `/metrics/${id}/archive`, { data: { archive: !unarchive } });
  }

  async listCustomSectionFields(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<CustomSectionField[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request<Record<string, unknown>>(
      'GET',
      '/experiment_custom_section_fields',
      { params }
    );
    return this.validateListResponse<CustomSectionField>(
      response,
      'experiment_custom_section_fields',
      'listCustomSectionFields'
    );
  }

  async getCustomSectionField(id: CustomSectionFieldId): Promise<CustomSectionField> {
    const response = await this.request('GET', `/experiment_custom_section_fields/${id}`);
    return this.validateEntityResponse<CustomSectionField>(
      response,
      'experiment_custom_section_field',
      'getCustomSectionField'
    );
  }

  async createCustomSectionField(data: Partial<CustomSectionField>): Promise<CustomSectionField> {
    const response = await this.request('POST', '/experiment_custom_section_fields', { data });
    return this.validateEntityResponse<CustomSectionField>(
      response,
      'experiment_custom_section_field',
      'createCustomSectionField'
    );
  }

  async updateCustomSectionField(
    id: CustomSectionFieldId,
    data: Partial<CustomSectionField>
  ): Promise<CustomSectionField> {
    const response = await this.request('PUT', `/experiment_custom_section_fields/${id}`, { data });
    return this.validateEntityResponse<CustomSectionField>(
      response,
      'experiment_custom_section_field',
      'updateCustomSectionField'
    );
  }

  async archiveCustomSectionField(id: CustomSectionFieldId, unarchive = false): Promise<void> {
    await this.request('PUT', `/experiment_custom_section_fields/${id}/archive`, {
      data: { archive: !unarchive },
    });
  }

  async listCustomSections(type?: string): Promise<unknown[]> {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const response = await this.request('GET', '/experiment_custom_sections', { params });
    return this.validateListResponse<unknown>(
      response,
      'experiment_custom_sections',
      'listCustomSections'
    );
  }

  async createCustomSection(data: { name: string; type: string }): Promise<unknown> {
    const response = await this.request('POST', '/experiment_custom_sections', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_custom_section',
      'createCustomSection'
    );
  }

  async updateCustomSection(id: CustomSectionId, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/experiment_custom_sections/${id}`, {
      data: { data },
    });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_custom_section',
      'updateCustomSection'
    );
  }

  async archiveCustomSection(id: CustomSectionId, unarchive = false): Promise<void> {
    await this.request('PUT', `/experiment_custom_sections/${id}/archive`, {
      data: { archive: !unarchive },
    });
  }

  async reorderCustomSections(sections: Array<{ id: number; order_index: number }>): Promise<void> {
    const response = await this.request('PUT', '/experiment_custom_sections/order', {
      data: { experiment_custom_sections: sections },
    });
    this.validateOkResponse(response, 'reorderCustomSections');
  }

  async listApplications(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Application[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/applications', { params });
    return this.validateListResponse<Application>(response, 'applications', 'listApplications');
  }

  async getApplication(id: ApplicationId): Promise<Application> {
    const response = await this.request('GET', `/applications/${id}`);
    return this.validateEntityResponse<Application>(response, 'application', 'getApplication');
  }

  async listEnvironments(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Environment[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/environments', { params });
    return this.validateListResponse<Environment>(response, 'environments', 'listEnvironments');
  }

  async getEnvironment(id: EnvironmentId): Promise<Environment> {
    const response = await this.request('GET', `/environments/${id}`);
    return this.validateEntityResponse<Environment>(response, 'environment', 'getEnvironment');
  }

  async listUnitTypes(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<UnitType[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/unit_types', { params });
    return this.validateListResponse<UnitType>(response, 'unit_types', 'listUnitTypes');
  }

  async getUnitType(id: UnitTypeId): Promise<UnitType> {
    const response = await this.request('GET', `/unit_types/${id}`);
    return this.validateEntityResponse<UnitType>(response, 'unit_type', 'getUnitType');
  }

  async listExperimentTags(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<ExperimentTag[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/experiment_tags', { params });
    return this.validateListResponse<ExperimentTag>(
      response,
      'experiment_tags',
      'listExperimentTags'
    );
  }

  async getExperimentTag(id: TagId): Promise<ExperimentTag> {
    const response = await this.request('GET', `/experiment_tags/${id}`);
    return this.validateEntityResponse<ExperimentTag>(
      response,
      'experiment_tag',
      'getExperimentTag'
    );
  }

  async createExperimentTag(data: { tag: string }): Promise<ExperimentTag> {
    const response = await this.request('POST', '/experiment_tags', { data });
    return this.validateEntityResponse<ExperimentTag>(
      response,
      'experiment_tag',
      'createExperimentTag'
    );
  }

  async updateExperimentTag(id: TagId, data: { tag: string }): Promise<ExperimentTag> {
    const response = await this.request('PUT', `/experiment_tags/${id}`, { data: { data } });
    return this.validateEntityResponse<ExperimentTag>(
      response,
      'experiment_tag',
      'updateExperimentTag'
    );
  }

  async deleteExperimentTag(id: TagId): Promise<void> {
    await this.request('DELETE', `/experiment_tags/${id}`);
  }

  async listGoalTags(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<GoalTag[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/goal_tags', { params });
    return this.validateListResponse<GoalTag>(response, 'goal_tags', 'listGoalTags');
  }

  async getGoalTag(id: TagId): Promise<GoalTag> {
    const response = await this.request('GET', `/goal_tags/${id}`);
    return this.validateEntityResponse<GoalTag>(response, 'goal_tag', 'getGoalTag');
  }

  async createGoalTag(data: { tag: string }): Promise<GoalTag> {
    const response = await this.request('POST', '/goal_tags', { data });
    return this.validateEntityResponse<GoalTag>(response, 'goal_tag', 'createGoalTag');
  }

  async updateGoalTag(id: TagId, data: { tag: string }): Promise<GoalTag> {
    const response = await this.request('PUT', `/goal_tags/${id}`, { data: { data } });
    return this.validateEntityResponse<GoalTag>(response, 'goal_tag', 'updateGoalTag');
  }

  async deleteGoalTag(id: TagId): Promise<void> {
    await this.request('DELETE', `/goal_tags/${id}`);
  }

  async listMetricTags(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<MetricTag[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/metric_tags', { params });
    return this.validateListResponse<MetricTag>(response, 'metric_tags', 'listMetricTags');
  }

  async getMetricTag(id: TagId): Promise<MetricTag> {
    const response = await this.request('GET', `/metric_tags/${id}`);
    return this.validateEntityResponse<MetricTag>(response, 'metric_tag', 'getMetricTag');
  }

  async createMetricTag(data: { tag: string }): Promise<MetricTag> {
    const response = await this.request('POST', '/metric_tags', { data });
    return this.validateEntityResponse<MetricTag>(response, 'metric_tag', 'createMetricTag');
  }

  async updateMetricTag(id: TagId, data: { tag: string }): Promise<MetricTag> {
    const response = await this.request('PUT', `/metric_tags/${id}`, { data: { data } });
    return this.validateEntityResponse<MetricTag>(response, 'metric_tag', 'updateMetricTag');
  }

  async deleteMetricTag(id: TagId): Promise<void> {
    await this.request('DELETE', `/metric_tags/${id}`);
  }

  async listMetricCategories(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<MetricCategory[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/metric_categories', { params });
    return this.validateListResponse<MetricCategory>(
      response,
      'metric_categories',
      'listMetricCategories'
    );
  }

  async getMetricCategory(id: TagId): Promise<MetricCategory> {
    const response = await this.request('GET', `/metric_categories/${id}`);
    return this.validateEntityResponse<MetricCategory>(
      response,
      'metric_category',
      'getMetricCategory'
    );
  }

  async createMetricCategory(data: {
    name: string;
    description?: string;
    color: string;
  }): Promise<MetricCategory> {
    const response = await this.request('POST', '/metric_categories', { data });
    return this.validateEntityResponse<MetricCategory>(
      response,
      'metric_category',
      'createMetricCategory'
    );
  }

  async updateMetricCategory(
    id: TagId,
    data: { name?: string; description?: string; color?: string }
  ): Promise<MetricCategory> {
    const response = await this.request('PUT', `/metric_categories/${id}`, { data: { data } });
    return this.validateEntityResponse<MetricCategory>(
      response,
      'metric_category',
      'updateMetricCategory'
    );
  }

  async archiveMetricCategory(id: TagId, archive = true): Promise<void> {
    await this.request('PUT', `/metric_categories/${id}/archive`, { data: { archive } });
  }

  async listRoles(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Role[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/roles', { params });
    return this.validateListResponse<Role>(response, 'roles', 'listRoles');
  }

  async getRole(id: RoleId): Promise<Role> {
    const response = await this.request('GET', `/roles/${id}`);
    return this.validateEntityResponse<Role>(response, 'role', 'getRole');
  }

  async createRole(data: Partial<Role>): Promise<Role> {
    const response = await this.request('POST', '/roles', { data });
    return this.validateEntityResponse<Role>(response, 'role', 'createRole');
  }

  async updateRole(id: RoleId, data: Partial<Role>): Promise<Role> {
    const response = await this.request('PUT', `/roles/${id}`, { data: { data } });
    return this.validateEntityResponse<Role>(response, 'role', 'updateRole');
  }

  async deleteRole(id: RoleId): Promise<void> {
    await this.request('DELETE', `/roles/${id}`);
  }

  async listPermissions(): Promise<Permission[]> {
    const response = await this.request('GET', '/permissions');
    return this.validateListResponse<Permission>(response, 'permissions', 'listPermissions');
  }

  async listPermissionCategories(): Promise<PermissionCategory[]> {
    const response = await this.request('GET', '/permission_categories');
    return this.validateListResponse<PermissionCategory>(
      response,
      'permission_categories',
      'listPermissionCategories'
    );
  }

  async listApiKeys(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<ApiKey[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/api_keys', { params });
    return this.validateListResponse<ApiKey>(response, 'api_keys', 'listApiKeys');
  }

  async getApiKey(id: ApiKeyId): Promise<ApiKey> {
    const response = await this.request('GET', `/api_keys/${id}`);
    return this.validateEntityResponse<ApiKey>(response, 'api_key', 'getApiKey');
  }

  async createApiKey(data: Partial<ApiKey>): Promise<ApiKey> {
    const response = await this.request('POST', '/api_keys', { data });
    return this.validateEntityResponse<ApiKey>(response, 'api_key', 'createApiKey');
  }

  async updateApiKey(id: ApiKeyId, data: Partial<ApiKey>): Promise<ApiKey> {
    const response = await this.request('PUT', `/api_keys/${id}`, { data: { data } });
    return this.validateEntityResponse<ApiKey>(response, 'api_key', 'updateApiKey');
  }

  async deleteApiKey(id: ApiKeyId): Promise<void> {
    await this.request('DELETE', `/api_keys/${id}`);
  }

  async listWebhooks(
    options: {
      items?: number;
      page?: number;
      search?: string | undefined;
      sort?: string | undefined;
      sort_asc?: boolean | undefined;
      archived?: boolean;
      ids?: string | undefined;
    } = {}
  ): Promise<Webhook[]> {
    const params: Record<string, string> = {};
    if (options.items !== undefined) params.items = String(options.items);
    if (options.page !== undefined) params.page = String(options.page);
    if (options.search) params.search = options.search;
    if (options.sort) params.sort = options.sort;
    if (options.sort_asc !== undefined) params.sort_asc = String(options.sort_asc);
    if (options.archived) params.archived = 'true';
    if (options.ids) params.ids = options.ids;
    const response = await this.request('GET', '/webhooks', { params });
    return this.validateListResponse<Webhook>(response, 'webhooks', 'listWebhooks');
  }

  async getWebhook(id: WebhookId): Promise<Webhook> {
    const response = await this.request('GET', `/webhooks/${id}`);
    return this.validateEntityResponse<Webhook>(response, 'webhook', 'getWebhook');
  }

  async createWebhook(data: Partial<Webhook>): Promise<Webhook> {
    const response = await this.request('POST', '/webhooks', { data });
    return this.validateEntityResponse<Webhook>(response, 'webhook', 'createWebhook');
  }

  async updateWebhook(id: WebhookId, data: Partial<Webhook>): Promise<Webhook> {
    const response = await this.request('PUT', `/webhooks/${id}`, { data: { data } });
    return this.validateEntityResponse<Webhook>(response, 'webhook', 'updateWebhook');
  }

  async deleteWebhook(id: WebhookId): Promise<void> {
    await this.request('DELETE', `/webhooks/${id}`);
  }

  async listTeamMembers(id: TeamId): Promise<User[]> {
    const response = await this.request('GET', `/teams/${id}/members`);
    return this.validateListResponse<User>(response, 'team_members', 'listTeamMembers');
  }

  async addTeamMembers(id: TeamId, userIds: UserId[], roleIds?: RoleId[]): Promise<void> {
    const body: Record<string, unknown> = { user_ids: userIds };
    if (roleIds) body.role_ids = roleIds;
    const response = await this.request('PUT', `/teams/${id}/members/add`, { data: body });
    this.validateOkResponse(response, 'addTeamMembers');
  }

  async editTeamMemberRoles(id: TeamId, userIds: UserId[], roleIds: RoleId[]): Promise<void> {
    const response = await this.request('PUT', `/teams/${id}/members/edit_roles`, {
      data: { user_ids: userIds, role_ids: roleIds },
    });
    this.validateOkResponse(response, 'editTeamMemberRoles');
  }

  async removeTeamMembers(id: TeamId, userIds: UserId[]): Promise<void> {
    const response = await this.request('PUT', `/teams/${id}/members/remove`, {
      data: { user_ids: userIds },
    });
    this.validateOkResponse(response, 'removeTeamMembers');
  }

  async followExperiment(id: ExperimentId): Promise<void> {
    const response = await this.request('POST', `/experiments/${id}/follow`);
    this.validateOkResponse(response, 'followExperiment');
  }

  async unfollowExperiment(id: ExperimentId): Promise<void> {
    const response = await this.request('DELETE', `/experiments/${id}/follow`);
    this.validateOkResponse(response, 'unfollowExperiment');
  }

  async followMetric(id: MetricId): Promise<void> {
    const response = await this.request('POST', `/metrics/${id}/follow`);
    this.validateOkResponse(response, 'followMetric');
  }

  async unfollowMetric(id: MetricId): Promise<void> {
    const response = await this.request('DELETE', `/metrics/${id}/follow`);
    this.validateOkResponse(response, 'unfollowMetric');
  }

  async followGoal(id: GoalId): Promise<void> {
    const response = await this.request('POST', `/goals/${id}/follow`);
    this.validateOkResponse(response, 'followGoal');
  }

  async unfollowGoal(id: GoalId): Promise<void> {
    const response = await this.request('DELETE', `/goals/${id}/follow`);
    this.validateOkResponse(response, 'unfollowGoal');
  }

  async favoriteExperiment(id: ExperimentId, favorite: boolean): Promise<void> {
    await this.request('PUT', '/favorites/experiment', {
      params: { id: String(id), favorite: String(favorite) },
    });
  }

  async favoriteMetric(id: MetricId, favorite: boolean): Promise<void> {
    await this.request('PUT', '/favorites/metric', {
      params: { id: String(id), favorite: String(favorite) },
    });
  }

  async getNotifications(cursor?: number): Promise<unknown[]> {
    const params: Record<string, string | number> = {};
    if (cursor !== undefined) params.cursor = cursor;
    const response = await this.request<Record<string, unknown>>('GET', '/notifications/summary', {
      params,
    });
    const data = response.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid API response for getNotifications: Expected object');
    }
    const notifications = (data as Record<string, unknown>).notifications;
    if (!Array.isArray(notifications)) {
      throw new Error('Invalid API response for getNotifications: Missing "notifications" array');
    }
    return notifications;
  }

  async markNotificationsSeen(): Promise<void> {
    const response = await this.request('PUT', '/notifications/see');
    this.validateOkResponse(response, 'markNotificationsSeen');
  }

  async markNotificationsRead(ids?: number[]): Promise<void> {
    const body: Record<string, unknown> = {};
    if (ids) body.ids = ids;
    const response = await this.request('PUT', '/notifications/read', { data: body });
    this.validateOkResponse(response, 'markNotificationsRead');
  }

  async hasNewNotifications(lastNotificationId?: number): Promise<boolean> {
    const params: Record<string, string | number> = {};
    if (lastNotificationId !== undefined) params.last_notification_id = lastNotificationId;
    const response = await this.request<Record<string, unknown>>('GET', '/notifications/has-new', {
      params,
    });
    const data = response.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid API response for hasNewNotifications: Expected object');
    }
    return Boolean((data as Record<string, unknown>).has_new);
  }

  async listExperimentAccessUsers(id: ExperimentId): Promise<unknown[]> {
    const response = await this.request('GET', `/experiments/${id}/asset_role_users`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_experiment_users',
      'listExperimentAccessUsers'
    );
  }

  async grantExperimentAccessUser(
    id: ExperimentId,
    userId: UserId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('POST', `/experiments/${id}/asset_role_users`, {
      data: { user_id: userId, asset_role_id: assetRoleId },
    });
  }

  async revokeExperimentAccessUser(
    id: ExperimentId,
    userId: UserId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('DELETE', `/experiments/${id}/asset_role_users/${userId}/${assetRoleId}`);
  }

  async listExperimentAccessTeams(id: ExperimentId): Promise<unknown[]> {
    const response = await this.request('GET', `/experiments/${id}/asset_role_teams`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_experiment_teams',
      'listExperimentAccessTeams'
    );
  }

  async grantExperimentAccessTeam(
    id: ExperimentId,
    teamId: TeamId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('POST', `/experiments/${id}/asset_role_teams`, {
      data: { team_id: teamId, asset_role_id: assetRoleId },
    });
  }

  async revokeExperimentAccessTeam(
    id: ExperimentId,
    teamId: TeamId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('DELETE', `/experiments/${id}/asset_role_teams/${teamId}/${assetRoleId}`);
  }

  async listMetricAccessUsers(id: MetricId): Promise<unknown[]> {
    const response = await this.request('GET', `/metrics/${id}/asset_role_users`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_metric_users',
      'listMetricAccessUsers'
    );
  }

  async grantMetricAccessUser(
    id: MetricId,
    userId: UserId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('POST', `/metrics/${id}/asset_role_users`, {
      data: { user_id: userId, asset_role_id: assetRoleId },
    });
  }

  async revokeMetricAccessUser(
    id: MetricId,
    userId: UserId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('DELETE', `/metrics/${id}/asset_role_users/${userId}/${assetRoleId}`);
  }

  async listMetricAccessTeams(id: MetricId): Promise<unknown[]> {
    const response = await this.request('GET', `/metrics/${id}/asset_role_teams`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_metric_teams',
      'listMetricAccessTeams'
    );
  }

  async grantMetricAccessTeam(
    id: MetricId,
    teamId: TeamId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('POST', `/metrics/${id}/asset_role_teams`, {
      data: { team_id: teamId, asset_role_id: assetRoleId },
    });
  }

  async revokeMetricAccessTeam(
    id: MetricId,
    teamId: TeamId,
    assetRoleId: AssetRoleId
  ): Promise<void> {
    await this.request('DELETE', `/metrics/${id}/asset_role_teams/${teamId}/${assetRoleId}`);
  }

  async listGoalAccessUsers(id: GoalId): Promise<unknown[]> {
    const response = await this.request('GET', `/goals/${id}/asset_role_users`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_goal_users',
      'listGoalAccessUsers'
    );
  }

  async grantGoalAccessUser(id: GoalId, userId: UserId, assetRoleId: AssetRoleId): Promise<void> {
    await this.request('POST', `/goals/${id}/asset_role_users`, {
      data: { user_id: userId, asset_role_id: assetRoleId },
    });
  }

  async revokeGoalAccessUser(id: GoalId, userId: UserId, assetRoleId: AssetRoleId): Promise<void> {
    await this.request('DELETE', `/goals/${id}/asset_role_users/${userId}/${assetRoleId}`);
  }

  async listGoalAccessTeams(id: GoalId): Promise<unknown[]> {
    const response = await this.request('GET', `/goals/${id}/asset_role_teams`);
    return this.validateListResponse<unknown>(
      response,
      'asset_role_goal_teams',
      'listGoalAccessTeams'
    );
  }

  async grantGoalAccessTeam(id: GoalId, teamId: TeamId, assetRoleId: AssetRoleId): Promise<void> {
    await this.request('POST', `/goals/${id}/asset_role_teams`, {
      data: { team_id: teamId, asset_role_id: assetRoleId },
    });
  }

  async revokeGoalAccessTeam(id: GoalId, teamId: TeamId, assetRoleId: AssetRoleId): Promise<void> {
    await this.request('DELETE', `/goals/${id}/asset_role_teams/${teamId}/${assetRoleId}`);
  }

  async listAssetRoles(): Promise<AssetRole[]> {
    const response = await this.request('GET', '/asset_roles');
    return this.validateListResponse<AssetRole>(response, 'asset_roles', 'listAssetRoles');
  }

  async getAssetRole(id: AssetRoleId): Promise<AssetRole> {
    const response = await this.request('GET', `/asset_roles/${id}`);
    return this.validateEntityResponse<AssetRole>(response, 'asset_role', 'getAssetRole');
  }

  async createAssetRole(data: { name: string; [key: string]: unknown }): Promise<AssetRole> {
    const response = await this.request('POST', '/asset_roles', { data });
    return this.validateEntityResponse<AssetRole>(response, 'asset_role', 'createAssetRole');
  }

  async updateAssetRole(id: AssetRoleId, data: Record<string, unknown>): Promise<AssetRole> {
    const response = await this.request('PUT', `/asset_roles/${id}`, { data: { data } });
    return this.validateEntityResponse<AssetRole>(response, 'asset_role', 'updateAssetRole');
  }

  async deleteAssetRole(id: AssetRoleId): Promise<void> {
    const response = await this.request('DELETE', `/asset_roles/${id}`);
    this.validateOkResponse(response, 'deleteAssetRole');
  }

  async requestMetricReview(id: MetricId): Promise<void> {
    const response = await this.request('POST', `/metrics/${id}/review/request`);
    this.validateOkResponse(response, 'requestMetricReview');
  }

  async getMetricReview(id: MetricId): Promise<unknown> {
    const response = await this.request('GET', `/metrics/${id}/review`);
    this.validateOkResponse(response, 'getMetricReview');
    return response.data;
  }

  async approveMetricReview(id: MetricId): Promise<void> {
    const response = await this.request('POST', `/metrics/${id}/review/approve`);
    this.validateOkResponse(response, 'approveMetricReview');
  }

  async listMetricReviewComments(id: MetricId): Promise<unknown[]> {
    const response = await this.request('GET', `/metrics/${id}/review/comments`);
    return this.validateListResponse<unknown>(response, 'comments', 'listMetricReviewComments');
  }

  async addMetricReviewComment(id: MetricId, message: string): Promise<unknown> {
    const response = await this.request('POST', `/metrics/${id}/review/comments`, {
      data: { message },
    });
    return response.data;
  }

  async replyToMetricReviewComment(
    id: MetricId,
    commentId: number,
    message: string
  ): Promise<unknown> {
    const response = await this.request(
      'POST',
      `/metrics/${id}/review/comments/${commentId}/reply`,
      { data: { message } }
    );
    return response.data;
  }

  async createApplication(data: { name: string; [key: string]: unknown }): Promise<Application> {
    const response = await this.request('POST', '/applications', { data });
    return this.validateEntityResponse<Application>(response, 'application', 'createApplication');
  }

  async updateApplication(id: ApplicationId, data: Record<string, unknown>): Promise<Application> {
    const response = await this.request('PUT', `/applications/${id}`, { data: { data } });
    return this.validateEntityResponse<Application>(response, 'application', 'updateApplication');
  }

  async archiveApplication(id: ApplicationId, unarchive = false): Promise<void> {
    await this.request('PUT', `/applications/${id}/archive`, { data: { archive: !unarchive } });
  }

  async createEnvironment(data: { name: string; [key: string]: unknown }): Promise<Environment> {
    const response = await this.request('POST', '/environments', { data });
    return this.validateEntityResponse<Environment>(response, 'environment', 'createEnvironment');
  }

  async updateEnvironment(id: EnvironmentId, data: Record<string, unknown>): Promise<Environment> {
    const response = await this.request('PUT', `/environments/${id}`, { data: { data } });
    return this.validateEntityResponse<Environment>(response, 'environment', 'updateEnvironment');
  }

  async archiveEnvironment(id: EnvironmentId, unarchive = false): Promise<void> {
    await this.request('PUT', `/environments/${id}/archive`, { data: { archive: !unarchive } });
  }

  async createUnitType(data: { name: string; [key: string]: unknown }): Promise<UnitType> {
    const response = await this.request('POST', '/unit_types', { data });
    return this.validateEntityResponse<UnitType>(response, 'unit_type', 'createUnitType');
  }

  async updateUnitType(id: UnitTypeId, data: Record<string, unknown>): Promise<UnitType> {
    const response = await this.request('PUT', `/unit_types/${id}`, { data: { data } });
    return this.validateEntityResponse<UnitType>(response, 'unit_type', 'updateUnitType');
  }

  async archiveUnitType(id: UnitTypeId, unarchive = false): Promise<void> {
    await this.request('PUT', `/unit_types/${id}/archive`, { data: { archive: !unarchive } });
  }

  async listAnnotations(experimentId?: ExperimentId): Promise<unknown[]> {
    const params: Record<string, string | number> = {};
    if (experimentId !== undefined) params.experiment_id = experimentId;
    const response = await this.request('GET', '/experiment_annotations', { params });
    return this.validateListResponse<unknown>(
      response,
      'experiment_annotations',
      'listAnnotations'
    );
  }

  async createAnnotation(data: {
    experiment_id: number;
    type?: string;
    [key: string]: unknown;
  }): Promise<unknown> {
    const response = await this.request('POST', '/experiment_annotations', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_annotation',
      'createAnnotation'
    );
  }

  async updateAnnotation(id: AnnotationId, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/experiment_annotations/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_annotation',
      'updateAnnotation'
    );
  }

  async archiveAnnotation(id: AnnotationId, unarchive = false): Promise<void> {
    await this.request('PUT', `/experiment_annotations/${id}/archive`, {
      data: { archive: !unarchive },
    });
  }

  private buildInsightParams(params: {
    from: number;
    to: number;
    aggregation: string;
    unit_type_ids?: number[];
    team_ids?: number[];
    owner_ids?: number[];
    teams?: string;
    applications?: string;
  }): Record<string, string> {
    const q: Record<string, string> = {
      from: String(params.from),
      to: String(params.to),
      aggregation: params.aggregation,
    };
    if (params.unit_type_ids) q.unit_type_ids = params.unit_type_ids.join(',');
    if (params.team_ids) q.team_ids = params.team_ids.join(',');
    if (params.owner_ids) q.owner_ids = params.owner_ids.join(',');
    if (params.teams) q.teams = params.teams;
    if (params.applications) q.applications = params.applications;
    return q;
  }

  async getVelocityInsights(params: {
    from: number;
    to: number;
    aggregation: string;
    unit_type_ids?: number[];
    team_ids?: number[];
    owner_ids?: number[];
  }): Promise<unknown> {
    const response = await this.request('GET', '/insights/velocity/summary', {
      params: this.buildInsightParams(params),
    });
    return response.data;
  }

  async getDecisionInsights(params: {
    from: number;
    to: number;
    aggregation: string;
    unit_type_ids?: number[];
    team_ids?: number[];
    owner_ids?: number[];
  }): Promise<unknown> {
    const response = await this.request('GET', '/insights/decisions/widgets', {
      params: this.buildInsightParams(params),
    });
    return response.data;
  }

  async listWebhookEvents(): Promise<unknown[]> {
    const response = await this.request('GET', '/webhook_events');
    return this.validateListResponse<unknown>(response, 'webhook_events', 'listWebhookEvents');
  }

  async listAccessControlPolicies(): Promise<unknown[]> {
    const response = await this.request('GET', '/access_control_policies');
    return this.validateListResponse<unknown>(
      response,
      'access_control_policies',
      'listAccessControlPolicies'
    );
  }

  async listPlatformConfigs(): Promise<unknown[]> {
    const response = await this.request('GET', '/configs');
    return this.validateListResponse<unknown>(response, 'configs', 'listPlatformConfigs');
  }

  async getPlatformConfig(id: number): Promise<unknown> {
    const response = await this.request('GET', `/configs/${id}`);
    return this.validateEntityResponse<unknown>(response, 'config', 'getPlatformConfig');
  }

  async updatePlatformConfig(id: number, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/configs/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(response, 'config', 'updatePlatformConfig');
  }

  async listCorsOrigins(): Promise<unknown[]> {
    const response = await this.request('GET', '/cors');
    return this.validateListResponse<unknown>(response, 'cors_allowed_origins', 'listCorsOrigins');
  }

  async getCorsOrigin(id: CorsOriginId): Promise<unknown> {
    const response = await this.request('GET', `/cors/${id}`);
    return this.validateEntityResponse<unknown>(response, 'cors_allowed_origin', 'getCorsOrigin');
  }

  async createCorsOrigin(data: { origin: string }): Promise<unknown> {
    const response = await this.request('POST', '/cors', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'cors_allowed_origin',
      'createCorsOrigin'
    );
  }

  async updateCorsOrigin(id: CorsOriginId, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/cors/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(
      response,
      'cors_allowed_origin',
      'updateCorsOrigin'
    );
  }

  async deleteCorsOrigin(id: CorsOriginId): Promise<void> {
    const response = await this.request('DELETE', `/cors/${id}`);
    this.validateOkResponse(response, 'deleteCorsOrigin');
  }

  async listDatasources(): Promise<unknown[]> {
    const response = await this.request('GET', '/datasources');
    return this.validateListResponse<unknown>(
      response,
      'event_datasource_configs',
      'listDatasources'
    );
  }

  async getDatasource(id: DatasourceId): Promise<unknown> {
    const response = await this.request('GET', `/datasources/${id}`);
    return this.validateEntityResponse<unknown>(
      response,
      'event_datasource_config',
      'getDatasource'
    );
  }

  async createDatasource(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/datasources', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'event_datasource_config',
      'createDatasource'
    );
  }

  async updateDatasource(id: DatasourceId, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/datasources/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(
      response,
      'event_datasource_config',
      'updateDatasource'
    );
  }

  async archiveDatasource(id: DatasourceId, unarchive = false): Promise<void> {
    await this.request('PUT', `/datasources/${id}/archive`, { data: { archive: !unarchive } });
  }

  async testDatasource(data: Record<string, unknown>): Promise<void> {
    const response = await this.request('POST', '/datasources/test', { data });
    this.validateOkResponse(response, 'testDatasource');
  }

  async introspectDatasource(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/datasources/introspect', { data });
    return response.data;
  }

  async validateDatasourceQuery(data: Record<string, unknown>): Promise<void> {
    const response = await this.request('POST', '/datasources/validate_query', { data });
    this.validateOkResponse(response, 'validateDatasourceQuery');
  }

  async listExportConfigs(params?: { statuses?: string }): Promise<ExportConfigShape[]> {
    const response = await this.request('GET', '/export_configs', {
      params: params as Record<string, string>,
    });
    return this.validateListResponse<ExportConfigShape>(
      response,
      'export_configs',
      'listExportConfigs'
    );
  }

  async getExportConfig(id: ExportConfigId): Promise<ExportConfigShape> {
    const response = await this.request('GET', `/export_configs/${id}`);
    return this.validateEntityResponse<ExportConfigShape>(
      response,
      'export_config',
      'getExportConfig'
    );
  }

  async createExportConfig(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/export_configs', { data });
    return this.validateEntityResponse<unknown>(response, 'export_config', 'createExportConfig');
  }

  async updateExportConfig(id: ExportConfigId, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/export_configs/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(response, 'export_config', 'updateExportConfig');
  }

  async archiveExportConfig(id: ExportConfigId, unarchive = false): Promise<void> {
    await this.request('PUT', `/export_configs/${id}/archive`, { data: { archive: !unarchive } });
  }

  async pauseExportConfig(id: ExportConfigId): Promise<void> {
    const response = await this.request('PUT', `/export_configs/${id}/pause`);
    this.validateOkResponse(response, 'pauseExportConfig');
  }

  async listExportHistories(id: ExportConfigId): Promise<ExportHistoryShape[]> {
    const response = await this.request('GET', `/export_configs/${id}/export_histories`);
    return this.validateListResponse<ExportHistoryShape>(
      response,
      'export_histories',
      'listExportHistories'
    );
  }

  async listUpdateSchedules(): Promise<unknown[]> {
    const response = await this.request('GET', '/experiment_update_schedules');
    return this.validateListResponse<unknown>(
      response,
      'experiment_update_schedules',
      'listUpdateSchedules'
    );
  }

  async getUpdateSchedule(id: UpdateScheduleId): Promise<unknown> {
    const response = await this.request('GET', `/experiment_update_schedules/${id}`);
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_update_schedule',
      'getUpdateSchedule'
    );
  }

  async createUpdateSchedule(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/experiment_update_schedules', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_update_schedule',
      'createUpdateSchedule'
    );
  }

  async updateUpdateSchedule(
    id: UpdateScheduleId,
    data: Record<string, unknown>
  ): Promise<unknown> {
    const response = await this.request('PUT', `/experiment_update_schedules/${id}`, {
      data: { data },
    });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_update_schedule',
      'updateUpdateSchedule'
    );
  }

  async deleteUpdateSchedule(id: UpdateScheduleId): Promise<void> {
    await this.request('DELETE', `/experiment_update_schedules/${id}`);
  }

  async uploadFile(
    usage: 'attachments' | 'variant_screenshots' | 'avatars',
    file: {
      data: string;
      file_name: string;
      file_size: number;
      content_type: string;
      width: number;
      height: number;
      crop_left: number;
      crop_top: number;
      crop_width: number;
      crop_height: number;
    }
  ): Promise<{
    id: number;
    file_usage_id: number;
    base_url: string;
    file_name: string;
    file_size: number;
    content_type: string;
    width: number;
    height: number;
    crop_left: number;
    crop_top: number;
    crop_width: number;
    crop_height: number;
  }> {
    const response = await this.request('POST', `/file_uploads/${usage}`, {
      data: { usage, file },
    });
    return this.validateEntityResponse(response, 'file', 'uploadFile');
  }

  async resolveMetrics(namesOrIds: string[]): Promise<Array<{ id: number; name: string }>> {
    const results = await resolveBySearch(namesOrIds, (name) =>
      this.listMetrics({ search: name, archived: true })
    );
    return namesOrIds.map((ref) => resolveByName(results, ref, 'Metric'));
  }

  async resolveGoals(namesOrIds: string[]): Promise<Array<{ id: number; name: string }>> {
    const results = await resolveBySearch(namesOrIds, (name) => this.listGoals({ search: name }));
    return namesOrIds.map((ref) => resolveByName(results, ref, 'Goal'));
  }

  async resolveTeams(namesOrIds: string[]): Promise<Array<{ id: number; name: string }>> {
    const results = await resolveBySearch(namesOrIds, (name) => this.listTeams({ search: name }));
    return namesOrIds.map((ref) => resolveByName(results, ref, 'Team'));
  }

  async resolveApplications(namesOrIds: string[]): Promise<Array<{ id: number; name: string }>> {
    const results = await resolveBySearch(namesOrIds, (name) =>
      this.listApplications({ search: name })
    );
    return namesOrIds.map((ref) => resolveByName(results, ref, 'Application'));
  }

  async resolveUnitTypes(namesOrIds: string[]): Promise<Array<{ id: number; name: string }>> {
    const results = await resolveBySearch(namesOrIds, (name) =>
      this.listUnitTypes({ search: name })
    );
    return namesOrIds.map((ref) => resolveByName(results, ref, 'Unit type'));
  }

  async resolveTags(namesOrIds: string[]): Promise<Array<{ id: number; tag: string }>> {
    const tags = await this.listExperimentTags();
    return namesOrIds.map((ref) => {
      const trimmed = ref.trim();
      const asInt = parseInt(trimmed, 10);
      if (!isNaN(asInt) && String(asInt) === trimmed) {
        const byId = tags.find((t) => t.id === asInt);
        if (byId) return byId;
        throw new Error(`Tag with ID ${asInt} not found`);
      }
      const match = tags.filter((t) => (t.tag ?? '').toLowerCase() === trimmed.toLowerCase());
      if (match.length === 1) return match[0]!;
      if (match.length > 1)
        throw new Error(
          `Multiple tags match "${trimmed}": ${match.map((t) => `"${t.tag}" (id: ${t.id})`).join(', ')}`
        );
      throw new Error(`Tag "${trimmed}" not found`);
    });
  }

  async resolveUsers(namesOrEmails: string[]): Promise<Array<{ id: number; email: string }>> {
    const results = await resolveBySearch(namesOrEmails, (ref) => this.listUsers({ search: ref }));
    return namesOrEmails.map((ref) => {
      const trimmed = ref.trim();
      const asInt = parseInt(trimmed, 10);
      if (!isNaN(asInt) && String(asInt) === trimmed) {
        const byId = results.find((u) => u.id === asInt);
        if (byId) return byId;
        throw new Error(`User with ID ${asInt} not found`);
      }
      const emailInBrackets = /<(.+?)>/.exec(trimmed);
      const searchRef = (emailInBrackets ? emailInBrackets[1]! : trimmed).toLowerCase();
      const match = results.filter(
        (u) =>
          u.email.toLowerCase() === searchRef ||
          `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim().toLowerCase() === searchRef
      );
      if (match.length === 1) return match[0]!;
      if (match.length > 1)
        throw new Error(
          `Multiple users match "${trimmed}": ${match.map((u) => `${u.email} (id: ${u.id})`).join(', ')}`
        );
      throw new Error(`User "${trimmed}" not found`);
    });
  }

  async listEvents(body: {
    filters?: {
      from?: number;
      to?: number;
      applications?: number[];
      unit_types?: number[];
      event_types?: string[];
      unit_uids?: string[];
      environment_types?: string[];
      event_names?: string[];
      effective_exposures?: boolean;
    };
    take?: number;
    skip?: number;
    unit_hex?: boolean;
  }): Promise<unknown> {
    const response = await this.request('POST', '/events', { data: body });
    return response.data;
  }

  async listEventsHistory(body: {
    filters?: {
      from?: number;
      to?: number;
      applications?: number[];
      unit_types?: number[];
      event_types?: string[];
      unit_uids?: string[];
      environment_types?: string[];
      event_names?: string[];
    };
    period?: string;
    tz_offset?: number;
  }): Promise<unknown> {
    const response = await this.request('POST', '/events/history', { data: body });
    return response.data;
  }

  async getEventUnitData(body: {
    units: Array<{ unit_type_id: number; uid: string }>;
  }): Promise<unknown> {
    const response = await this.request('POST', '/events/unit_data', { data: body });
    return response.data;
  }

  async deleteEventUnitData(body: {
    units: Array<{ unit_type_id: number; uid: string }>;
  }): Promise<unknown> {
    const response = await this.request('DELETE', '/events/unit_data', { data: body });
    return response.data;
  }

  async getEventJsonValues(body: {
    event_type: 'exposure' | 'goal' | 'attribute';
    path: string;
    from?: number;
    to?: number;
    experiment_id?: number;
    goal_id?: number;
    take?: number;
    skip?: number;
    sort?: string;
  }): Promise<unknown> {
    const response = await this.request('POST', '/events/json_values', { data: body });
    return response.data;
  }

  async getEventJsonLayouts(body: {
    source: 'unit_attribute' | 'unit_goal_property';
    phase: 'before_enrichment' | 'after_enrichment';
    prefix?: string;
    source_id?: number;
    from?: number;
    to?: number;
    take?: number;
    skip?: number;
    sort?: string;
  }): Promise<unknown> {
    const response = await this.request('POST', '/events/json_layouts', { data: body });
    return response.data;
  }

  async getEventsSummary(params: { from?: number; to?: number }): Promise<unknown> {
    const queryParams: Record<string, string | number | boolean | undefined> = {};
    if (params.from !== undefined) queryParams.from = params.from;
    if (params.to !== undefined) queryParams.to = params.to;
    const response = await this.request('GET', '/events/summary', { params: queryParams });
    return response.data;
  }

  async getVelocityInsightsDetail(params: {
    from: number;
    to: number;
    aggregation: string;
    teams?: string;
    applications?: string;
  }): Promise<unknown> {
    const response = await this.request('GET', '/insights/velocity/summary/detail', {
      params: this.buildInsightParams(params),
    });
    return response.data;
  }

  async getDecisionInsightsHistory(params: {
    from: number;
    to: number;
    aggregation: string;
    teams?: string;
    applications?: string;
  }): Promise<unknown> {
    const response = await this.request('GET', '/insights/decisions/history', {
      params: this.buildInsightParams(params),
    });
    return response.data;
  }

  async getPowerAnalysisMatrix(body: {
    split: number[];
    metric_mean: number;
    metric_variance: number;
    metric_type: string;
    metric_custom_statistics_type?: string;
    analysis_type?: string;
    two_sided?: boolean;
    sample_sizes?: number[];
    minimum_detectable_effects?: number[];
    powers?: number[];
    alphas?: number[];
    power?: number;
    alpha?: number;
    participants_per_week?: number;
    group_sequential_futility_type?: string;
    group_sequential_first_analysis_interval?: string;
    group_sequential_min_analysis_interval?: string;
  }): Promise<{ matrix: number[][] }> {
    const response = await this.request<{ matrix: number[][] }>(
      'POST',
      '/statistics/power/plan/matrix',
      { data: body }
    );
    return response.data as { matrix: number[][] };
  }

  async listStorageConfigs(): Promise<unknown[]> {
    const response = await this.request('GET', '/storage_configs');
    return this.validateListResponse<unknown>(response, 'storage_configs', 'listStorageConfigs');
  }

  async getStorageConfig(id: number): Promise<unknown> {
    const response = await this.request('GET', `/storage_configs/${id}`);
    return this.validateEntityResponse<unknown>(response, 'storage_config', 'getStorageConfig');
  }

  async createStorageConfig(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/storage_configs', { data });
    return this.validateEntityResponse<unknown>(response, 'storage_config', 'createStorageConfig');
  }

  async updateStorageConfig(id: number, data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('PUT', `/storage_configs/${id}`, { data: { data } });
    return this.validateEntityResponse<unknown>(response, 'storage_config', 'updateStorageConfig');
  }

  async testStorageConfig(data: Record<string, unknown>): Promise<void> {
    const response = await this.request('POST', '/storage_configs/test', { data });
    this.validateOkResponse(response, 'testStorageConfig');
  }

  async previewDatasourceQuery(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/datasources/preview_query', { data });
    return response.data;
  }

  async setDefaultDatasource(id: DatasourceId): Promise<unknown> {
    const response = await this.request('PUT', `/datasources/${id}/set_default`);
    return response.data;
  }

  async getDatasourceSchema(id: DatasourceId): Promise<unknown> {
    const response = await this.request('GET', `/datasources/${id}/schema`);
    return response.data;
  }

  async deleteDatasource(id: DatasourceId): Promise<void> {
    const response = await this.request('DELETE', `/datasources/${id}`);
    this.validateOkResponse(response, 'deleteDatasource');
  }

  async createDatasourceJsonLayouts(id: DatasourceId): Promise<void> {
    await this.request('POST', `/datasources/${id}/json_layouts/create`);
  }

  async recreateDatasourceJsonLayouts(id: DatasourceId): Promise<void> {
    await this.request('POST', `/datasources/${id}/json_layouts/recreate`);
  }

  async previewDatasourceJsonLayouts(id: DatasourceId): Promise<unknown> {
    const response = await this.request('POST', `/datasources/${id}/json_layouts/preview`);
    return response.data;
  }

  async cancelExportHistory(
    exportConfigId: ExportConfigId,
    historyId: number,
    reason?: string
  ): Promise<unknown> {
    const response = await this.request(
      'PUT',
      `/export_configs/${exportConfigId}/export_histories/${historyId}/cancel`,
      { data: { reason: reason ?? '' } }
    );
    return response.data;
  }

  async listUserApiKeys(): Promise<unknown[]> {
    const rootUrl = this.getRootUrl();
    const response = await this.request('GET', `${rootUrl}/auth/current-user/api_keys`);
    return this.validateListResponse<unknown>(response, 'user_api_keys', 'listUserApiKeys');
  }

  async getUserApiKey(id: number): Promise<unknown> {
    const rootUrl = this.getRootUrl();
    const response = await this.request('GET', `${rootUrl}/auth/current-user/api_keys/${id}`);
    return this.validateEntityResponse<unknown>(response, 'user_api_key', 'getUserApiKey');
  }

  async updateUserApiKey(
    id: number,
    data: { name?: string; description?: string }
  ): Promise<unknown> {
    const rootUrl = this.getRootUrl();
    const response = await this.request('PUT', `${rootUrl}/auth/current-user/api_keys/${id}`, {
      data: { data },
    });
    return this.validateEntityResponse<unknown>(response, 'user_api_key', 'updateUserApiKey');
  }

  async deleteUserApiKey(id: number): Promise<void> {
    const rootUrl = this.getRootUrl();
    await this.request('DELETE', `${rootUrl}/auth/current-user/api_keys/${id}`);
  }

  async updateCurrentUser(data: {
    first_name?: string;
    last_name?: string;
    department?: string;
    job_title?: string;
    date_format_locale?: string;
    old_password?: string;
    new_password?: string;
  }): Promise<User> {
    const rootUrl = this.getRootUrl();
    const response = await this.request('PUT', `${rootUrl}/auth/current-user`, { data: { data } });
    return this.validateEntityResponse<User>(response, 'user', 'updateCurrentUser');
  }

  async listExperimentActionDialogFields(): Promise<unknown[]> {
    const response = await this.request('GET', '/experiment_action_dialog_fields');
    return this.validateListResponse<unknown>(
      response,
      'experiment_action_dialog_fields',
      'listExperimentActionDialogFields'
    );
  }

  async getExperimentActionDialogField(id: number): Promise<unknown> {
    const response = await this.request('GET', `/experiment_action_dialog_fields/${id}`);
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_action_dialog_field',
      'getExperimentActionDialogField'
    );
  }

  async createExperimentActionDialogField(data: Record<string, unknown>): Promise<unknown> {
    const response = await this.request('POST', '/experiment_action_dialog_fields', { data });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_action_dialog_field',
      'createExperimentActionDialogField'
    );
  }

  async updateExperimentActionDialogField(
    id: number,
    data: Record<string, unknown>
  ): Promise<unknown> {
    const response = await this.request('PUT', `/experiment_action_dialog_fields/${id}`, {
      data: { data },
    });
    return this.validateEntityResponse<unknown>(
      response,
      'experiment_action_dialog_field',
      'updateExperimentActionDialogField'
    );
  }

  async rawRequest(
    path: string,
    method = 'GET',
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<unknown> {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(path);
    } catch {
      throw new Error('Invalid API path: Contains malformed percent-encoding.');
    }

    for (const p of [path, decodedPath]) {
      if (p.includes('://') || p.startsWith('//')) {
        throw new Error(
          'Invalid API path: Absolute or protocol-relative URLs are not allowed.\n' +
            'Paths must be relative to the API endpoint (e.g., /experiments, /goals).'
        );
      }

      if (!p.startsWith('/')) {
        throw new Error(
          'Invalid API path: Must start with "/" (e.g., /experiments, not experiments).'
        );
      }

      if (p.includes('/../') || p.endsWith('/..') || p.includes('/./') || p === '/..') {
        throw new Error(
          'Invalid API path: Path traversal sequences (../, ./) are not allowed.\n' +
            'Use absolute paths from API root (e.g., /experiments, /goals).'
        );
      }
    }

    const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
    const normalizedMethod = method.toUpperCase();
    if (!ALLOWED_METHODS.includes(normalizedMethod as (typeof ALLOWED_METHODS)[number])) {
      throw new Error(`Unsupported HTTP method: ${method}. Allowed: ${ALLOWED_METHODS.join(', ')}`);
    }
    const response = await this.request(
      normalizedMethod as (typeof ALLOWED_METHODS)[number],
      decodedPath,
      {
        ...(data !== undefined && { data }),
        ...(headers && { headers }),
      }
    );
    return response.data;
  }
}

export function createAPIClient(httpClient: HttpClient): APIClient {
  return new APIClient(httpClient);
}
