import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metricsCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('metrics command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listMetrics: vi.fn().mockResolvedValue([{ id: 1, name: 'ctr' }]),
    getMetric: vi.fn().mockResolvedValue({ id: 1, name: 'ctr' }),
    createMetric: vi.fn().mockResolvedValue({ id: 99 }),
    updateMetric: vi.fn().mockResolvedValue({}),
    archiveMetric: vi.fn().mockResolvedValue({}),
    activateMetric: vi.fn().mockResolvedValue({}),
    createMetricVersion: vi.fn().mockResolvedValue({ id: 123, version: 2 }),
    resolveUsers: vi.fn().mockImplementation((refs: string[]) =>
      Promise.resolve(
        refs.map((ref) => {
          if (ref === 'jane@example.com') return { id: 10, email: 'jane@example.com' };
          if (ref === 'John Smith') return { id: 20, email: 'john@example.com' };
          return { id: parseInt(ref, 10), email: `user${ref}@example.com` };
        })
      )
    ),
    resolveTeams: vi.fn().mockImplementation((refs: string[]) =>
      Promise.resolve(
        refs.map((ref) => {
          if (ref === 'Growth') return { id: 5, name: 'Growth' };
          return { id: parseInt(ref, 10), name: `Team ${ref}` };
        })
      )
    ),
    resolveGoals: vi.fn().mockImplementation((refs: string[]) =>
      Promise.resolve(
        refs.map((ref) => {
          if (ref === 'purchase') return { id: 42, name: 'purchase' };
          return { id: parseInt(ref, 10), name: `Goal ${ref}` };
        })
      )
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(metricsCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    vi.mocked(printFormatted).mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new Error(`process.exit: ${code}`);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  const defaultListParams = {
    items: 100,
    page: 1,
    archived: undefined,
    include_drafts: undefined,
    search: undefined,
    sort: undefined,
    sort_asc: undefined,
    ids: undefined,
    owners: undefined,
    teams: undefined,
    review_status: undefined,
  };

  it('should list metrics', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith(defaultListParams);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list metrics with search filter', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--search', 'ctr']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, search: 'ctr' });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list metrics with sort and direction', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--sort', 'name', '--asc']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({
      ...defaultListParams,
      sort: 'name',
      sort_asc: true,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list metrics filtered by owner IDs', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--owners', '1,2,3']);

    expect(mockClient.resolveUsers).not.toHaveBeenCalled();
    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, owners: '1,2,3' });
  });

  it('should list metrics filtered by owner email', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--owners', 'jane@example.com']);

    expect(mockClient.resolveUsers).toHaveBeenCalledWith(['jane@example.com']);
    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, owners: '10' });
  });

  it('should list metrics filtered by team IDs', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--teams', '5,10']);

    expect(mockClient.resolveTeams).not.toHaveBeenCalled();
    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, teams: '5,10' });
  });

  it('should list metrics filtered by team name', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--teams', 'Growth']);

    expect(mockClient.resolveTeams).toHaveBeenCalledWith(['Growth']);
    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, teams: '5' });
  });

  it('should list metrics filtered by ids', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--ids', '1,2,3']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({ ...defaultListParams, ids: '1,2,3' });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list metrics filtered by review status', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--review-status', 'pending']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({
      ...defaultListParams,
      review_status: 'pending',
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list metrics with all filters combined', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'list',
      '--archived',
      '--search',
      'conversion',
      '--sort',
      'created_at',
      '--desc',
      '--owners',
      '1',
      '--teams',
      '2',
      '--review-status',
      'approved',
    ]);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({
      ...defaultListParams,
      archived: true,
      search: 'conversion',
      sort: 'created_at',
      sort_asc: false,
      owners: '1',
      teams: '2',
      review_status: 'approved',
    });
  });

  it('should list metrics with include-drafts flag', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list', '--include-drafts']);

    expect(mockClient.listMetrics).toHaveBeenCalledWith({
      ...defaultListParams,
      include_drafts: true,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  const richMetrics = [
    {
      id: 1,
      name: 'a',
      type: 'goal_count',
      effect: 'positive',
      goal_id: 1,
      goal: { id: 1, name: 'page_view' },
      outlier_limit_method: 'unlimited',
      vr_lookback_interval: null,
      property_filter: null,
    },
    {
      id: 2,
      name: 'b',
      type: 'goal_ratio',
      effect: 'negative',
      goal_id: 2,
      goal: { id: 2, name: 'checkout' },
      outlier_limit_method: 'quantile',
      vr_lookback_interval: '2w',
      property_filter: '{"filter":{"and":[{"var":{"path":"page_name"}}]}}',
    },
    {
      id: 3,
      name: 'c',
      type: 'custom_sql',
      effect: 'unknown',
      goal_id: 3,
      goal: { id: 3, name: 'purchase' },
      outlier_limit_method: 'unlimited',
      vr_lookback_interval: null,
      property_filter: null,
    },
  ];

  it('filters metrics list by --metric-type (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync([
      'node',
      'test',
      'list',
      '--metric-type',
      'goal_ratio,custom_sql',
    ]);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([2, 3]);
  });

  it('filters metrics list by --cuped (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync(['node', 'test', 'list', '--cuped']);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([2]);
  });

  it('filters metrics list by --no-cuped (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync(['node', 'test', 'list', '--no-cuped']);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([1, 3]);
  });

  it('filters metrics list by --has-property-filter (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync(['node', 'test', 'list', '--has-property-filter']);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([2]);
  });

  it('filters metrics list by --no-property-filter (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync(['node', 'test', 'list', '--no-property-filter']);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([1, 3]);
  });

  it('rejects combining --has-property-filter with --no-property-filter', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    try {
      await metricsCommand.parseAsync([
        'node',
        'test',
        'list',
        '--has-property-filter',
        '--no-property-filter',
      ]);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('property-filter');
    }
  });

  it('filters metrics list by --goal name (client-side)', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    await metricsCommand.parseAsync(['node', 'test', 'list', '--goal', 'checkout']);

    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ id: number }>;
    expect(printed.map((m) => m.id)).toEqual([2]);
  });

  it('rejects an invalid --impact-direction value', async () => {
    mockClient.listMetrics.mockResolvedValue(richMetrics);
    try {
      await metricsCommand.parseAsync(['node', 'test', 'list', '--impact-direction', 'sideways']);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('impact-direction');
    }
  });

  it('does not client-filter (single page) when no new filters are passed', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'list']);
    expect(mockClient.listMetrics).toHaveBeenCalledWith(defaultListParams);
  });

  it('should get metric by id', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getMetric).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.anything()
    );
  });

  it('should create a metric with required fields', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'ctr',
      '--type',
      'goal_count',
      '--goal',
      '1',
      '--description',
      'Click-through rate',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ctr',
        type: 'goal_count',
        description: 'Click-through rate',
        effect: 'positive',
      })
    );
  });

  it('should create a goal_property metric with value-source-property', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Net Revenue',
      '--type',
      'goal_property',
      '--goal',
      '1',
      '--description',
      'Net revenue',
      '--value-source-property',
      'amount',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Net Revenue',
        type: 'goal_property',
        goal_id: 1,
        value_source_property: 'amount',
      })
    );
  });

  it('should create a custom_sql metric pinned to a datasource via --datasource-id', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'BQ conversions',
      '--type',
      'custom_sql',
      '--description',
      'BigQuery conversions',
      '--custom-sql',
      'SELECT 1',
      '--custom-statistics-type',
      'binomial',
      '--datasource-id',
      '10',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom_sql',
        custom_sql: 'SELECT 1',
        datasource_id: 10,
      })
    );
  });

  it('should create a goal_ratio metric with numerator and denominator types', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Conversion Rate',
      '--type',
      'goal_ratio',
      '--description',
      'Purchases per visit',
      '--numerator-type',
      'goal_unique_count',
      '--denominator-type',
      'goal_count',
      '--denominator-outlier-limit-method',
      'unlimited',
      '--goal',
      '1',
      '--denominator-goal',
      '2',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal_ratio',
        numerator_type: 'goal_unique_count',
        denominator_type: 'goal_count',
        denominator_outlier_limit_method: 'unlimited',
        goal_id: 1,
        denominator_goal_id: 2,
      })
    );
  });

  it('should resolve denominator goal name via API', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Revenue per Signup',
      '--type',
      'goal_ratio',
      '--description',
      'Rev / signups',
      '--numerator-type',
      'goal_property',
      '--denominator-type',
      'goal_count',
      '--denominator-outlier-limit-method',
      'unlimited',
      '--goal',
      '1',
      '--denominator-goal',
      'purchase',
      '--value-source-property',
      'amount',
    ]);

    expect(mockClient.resolveGoals).toHaveBeenCalledWith(['purchase']);
    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal_ratio',
        numerator_type: 'goal_property',
        denominator_type: 'goal_count',
        denominator_goal_id: 42,
        value_source_property: 'amount',
      })
    );
  });

  it('should parse --property-filter as JSON', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Filtered Revenue',
      '--type',
      'goal_property',
      '--description',
      'Filtered',
      '--goal',
      '1',
      '--value-source-property',
      'amount',
      '--property-filter',
      '{"currency":"USD"}',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        property_filter: { currency: 'USD' },
      })
    );
  });

  it('should error on invalid --property-filter JSON', async () => {
    await expect(
      metricsCommand.parseAsync([
        'node',
        'test',
        'create',
        '--name',
        'Bad',
        '--type',
        'goal_property',
        '--description',
        'd',
        '--property-filter',
        'not json',
      ])
    ).rejects.toThrow(/Invalid JSON/);
    expect(mockClient.createMetric).not.toHaveBeenCalled();
  });

  it('should forward goal_retention fields on create', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Day-7 Retention',
      '--type',
      'goal_retention',
      '--description',
      'Retained after 7 days',
      '--goal',
      '1',
      '--retention-time',
      '7d',
      '--retention-time-reference',
      'first_exposure',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal_retention',
        retention_time: '7d',
        retention_time_reference: 'first_exposure',
      })
    );
  });

  it('should forward all denominator-side goal_ratio fields', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Ratio',
      '--type',
      'goal_ratio',
      '--description',
      'd',
      '--numerator-type',
      'goal_count',
      '--denominator-type',
      'goal_property',
      '--goal',
      '1',
      '--denominator-goal',
      '2',
      '--denominator-value-source-property',
      'amount',
      '--denominator-outlier-limit-method',
      'quantile',
      '--denominator-property-filter',
      '{"kind":"paid"}',
      '--ratio-condition',
      'require_denominator',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal_ratio',
        numerator_type: 'goal_count',
        denominator_type: 'goal_property',
        denominator_goal_id: 2,
        denominator_value_source_property: 'amount',
        denominator_outlier_limit_method: 'quantile',
        denominator_property_filter: { kind: 'paid' },
        ratio_condition: 'require_denominator',
      })
    );
  });

  it('should change numerator_type via `metric version`', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'switch numerator',
      '--numerator-type',
      'goal_property',
      '--goal',
      '1',
      '--value-source-property',
      'amount',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      1,
      {
        numerator_type: 'goal_property',
        goal_id: 1,
        value_source_property: 'amount',
      },
      'switch numerator'
    );
  });

  it('should reject goal_ratio create missing denominator goal id with a clear message', async () => {
    try {
      await metricsCommand.parseAsync([
        'node',
        'test',
        'create',
        '--name',
        'Bad',
        '--type',
        'goal_ratio',
        '--description',
        'd',
        '--numerator-type',
        'goal_count',
        '--denominator-type',
        'goal_count',
        '--denominator-outlier-limit-method',
        'unlimited',
        '--goal',
        '1',
      ]);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('--denominator-goal is required');
    }
    expect(mockClient.createMetric).not.toHaveBeenCalled();
  });

  it('should reject version changing numerator_type without the fields it implies', async () => {
    try {
      await metricsCommand.parseAsync([
        'node',
        'test',
        'version',
        '1',
        '--reason',
        'switch',
        '--numerator-type',
        'goal_property',
      ]);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('--value-source-property is required');
    }
    expect(mockClient.createMetricVersion).not.toHaveBeenCalled();
  });

  it('should allow version to change fields that do not alter type shape', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'rename',
      '--name',
      'new name',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(1, { name: 'new name' }, 'rename');
  });

  it('should create a metric with goal name resolved to ID', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Purchase Rate',
      '--type',
      'goal_count',
      '--goal',
      'purchase',
      '--description',
      'Purchase rate',
    ]);

    expect(mockClient.resolveGoals).toHaveBeenCalledWith(['purchase']);
    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Purchase Rate',
        type: 'goal_count',
        goal_id: 42,
      })
    );
  });

  it('should create a metric with --goal-id (deprecated) for backwards compatibility', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Legacy Metric',
      '--type',
      'goal_count',
      '--goal-id',
      '7',
      '--description',
      'Legacy metric',
    ]);

    expect(mockClient.resolveGoals).not.toHaveBeenCalled();
    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_id: 7,
      })
    );
  });

  it('should create and activate a metric with --activate', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Active Metric',
      '--type',
      'goal_count',
      '--goal',
      '1',
      '--description',
      'Activated on creation',
      '--activate',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalled();
    expect(mockClient.activateMetric).toHaveBeenCalledWith(99, 'Initial activation');
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('activated');
  });

  it('should not activate when --activate is not passed', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--name',
      'Draft Metric',
      '--type',
      'goal_count',
      '--goal',
      '1',
      '--description',
      'Not activated',
    ]);

    expect(mockClient.createMetric).toHaveBeenCalled();
    expect(mockClient.activateMetric).not.toHaveBeenCalled();
  });

  it('should update a metric', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'update', '1', '--description', 'x']);

    expect(mockClient.updateMetric).toHaveBeenCalledWith(1, { description: 'x' });
  });

  it('should update a metric name', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'update', '1', '--name', 'new-name']);

    expect(mockClient.updateMetric).toHaveBeenCalledWith(1, { name: 'new-name' });
  });

  it('should update a metric owner', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'update', '1', '--owner', '42']);

    expect(mockClient.updateMetric).toHaveBeenCalledWith(1, { owners: [{ user_id: 42 }] });
  });

  it('should reject update with no fields', async () => {
    try {
      await metricsCommand.parseAsync(['node', 'test', 'update', '1']);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('update field');
    }
  });

  it('should create a new metric version with `version` subcommand', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'Switch to tukey outlier',
      '--outlier-limit-method',
      'tukey',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      1,
      { outlier_limit_method: 'tukey' },
      'Switch to tukey outlier'
    );
    expect(mockClient.activateMetric).not.toHaveBeenCalled();
  });

  it('should pass --datasource-id through to the version payload', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'pin to bigquery',
      '--datasource-id',
      '10',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      1,
      { datasource_id: 10 },
      'pin to bigquery'
    );
  });

  it('should omit datasource_id from the version payload when --datasource-id is not passed', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'rename',
      '--name',
      'x',
    ]);

    const payload = mockClient.createMetricVersion.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('datasource_id');
  });

  it('should support `new-version` alias', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'new-version',
      '1',
      '--reason',
      'rename',
      '--name',
      'ctr v2',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(1, { name: 'ctr v2' }, 'rename');
  });

  it('should create and activate a new version with --activate', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'version',
      '1',
      '--reason',
      'bump',
      '--type',
      'goal_unique_count',
      '--goal',
      '1',
      '--activate',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      1,
      { type: 'goal_unique_count', goal_id: 1 },
      'bump'
    );
    expect(mockClient.activateMetric).toHaveBeenCalledWith(123, 'bump');
  });

  it('should route `create --new-version` to createMetricVersion', async () => {
    await metricsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--new-version',
      '1',
      '--reason',
      'change format',
      '--format-str',
      '{}%',
    ]);

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      1,
      { format_str: '{}%' },
      'change format'
    );
    expect(mockClient.createMetric).not.toHaveBeenCalled();
  });

  it('should error when `create --new-version` is given without --reason', async () => {
    try {
      await metricsCommand.parseAsync([
        'node',
        'test',
        'create',
        '--new-version',
        '1',
        '--format-str',
        '{}%',
      ]);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('reason');
    }
    expect(mockClient.createMetricVersion).not.toHaveBeenCalled();
  });

  it('should still require --name/--type/--description when --new-version is absent', async () => {
    try {
      await metricsCommand.parseAsync(['node', 'test', 'create', '--name', 'only-name']);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput.toLowerCase()).toContain('required');
    }
    expect(mockClient.createMetric).not.toHaveBeenCalled();
  });

  it('should archive a metric', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'archive', '1']);

    expect(mockClient.archiveMetric).toHaveBeenCalledWith(1, undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('archived');
  });

  it('should unarchive a metric', async () => {
    await metricsCommand.parseAsync(['node', 'test', 'archive', '1', '--unarchive']);

    expect(mockClient.archiveMetric).toHaveBeenCalledWith(1, true);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('unarchived');
  });
});
