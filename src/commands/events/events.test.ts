import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventsCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { formatDateTime } from '../../api-client/format-helpers.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('events command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listEvents: vi.fn().mockResolvedValue({ items: [{ id: 1, type: 'exposure' }], total: 1 }),
    listEventsHistory: vi
      .fn()
      .mockResolvedValue({ history: [{ period: '2024-01-01', count: 100 }] }),
    getEventUnitData: vi
      .fn()
      .mockResolvedValue({ units: [{ unit_type_id: 1, uid: 'user123', data: {} }] }),
    deleteEventUnitData: vi.fn().mockResolvedValue({ deleted: 1 }),
    getEventJsonValues: vi.fn().mockResolvedValue({ values: ['control', 'treatment'] }),
    getEventJsonLayouts: vi
      .fn()
      .mockResolvedValue({ layouts: [{ path: 'variant', type: 'string' }] }),
    getEventsSummary: vi.fn().mockResolvedValue({
      events: [
        { date: Date.UTC(2026, 4, 4), team_id: 1, count: 100, type: 'exposure' },
        { date: Date.UTC(2026, 4, 4), team_id: 1, count: 5, type: 'goal' },
      ],
      teams: [{ id: 1, name: 'Growth', initials: 'GR', color: 'blue' }],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(eventsCommand);
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

  it('should list events', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listEvents).toHaveBeenCalledWith({ take: 100 });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list events with filters', async () => {
    await eventsCommand.parseAsync([
      'node',
      'test',
      'list',
      '--from',
      '1000',
      '--to',
      '2000',
      '--app',
      '1',
      '--items',
      '50',
    ]);

    expect(mockClient.listEvents).toHaveBeenCalledWith({
      filters: {
        from: 1000,
        to: 2000,
        applications: [1],
      },
      take: 50,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should send effective_exposures=true with --valid-exposures', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'list', '--valid-exposures']);
    expect(mockClient.listEvents).toHaveBeenCalledWith({
      filters: { effective_exposures: true },
      take: 100,
    });
  });

  it('should send effective_exposures=false with --invalid-exposures', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'list', '--invalid-exposures']);
    expect(mockClient.listEvents).toHaveBeenCalledWith({
      filters: { effective_exposures: false },
      take: 100,
    });
  });

  it('should reject combining --valid-exposures and --invalid-exposures', async () => {
    await expect(
      eventsCommand.parseAsync(['node', 'test', 'list', '--valid-exposures', '--invalid-exposures'])
    ).rejects.toThrow('process.exit');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('mutually exclusive')
    );
  });

  it('should list events history with filters', async () => {
    await eventsCommand.parseAsync([
      'node',
      'test',
      'history',
      '--from',
      '1000',
      '--to',
      '2000',
      '--period',
      '1d',
    ]);

    expect(mockClient.listEventsHistory).toHaveBeenCalledWith({
      filters: {
        from: 1000,
        to: 2000,
      },
      period: '1d',
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should get event unit data', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'unit-data', '1:user123', '2:device456']);

    expect(mockClient.getEventUnitData).toHaveBeenCalledWith({
      units: [
        { unit_type_id: 1, uid: 'user123' },
        { unit_type_id: 2, uid: 'device456' },
      ],
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should delete event unit data', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'delete-unit-data', '1:user123']);

    expect(mockClient.deleteEventUnitData).toHaveBeenCalledWith({
      units: [{ unit_type_id: 1, uid: 'user123' }],
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unit data deleted for 1 unit(s)')
    );
  });

  it('should get event json values', async () => {
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-values',
      '--event-type',
      'exposure',
      '--path',
      'variant',
    ]);

    expect(mockClient.getEventJsonValues).toHaveBeenCalledWith({
      event_type: 'exposure',
      path: 'variant',
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  const columnarValues = {
    columnNames: ['value', 'last_event_at'],
    columnTypes: ['String', 'Int64'],
    rows: [
      ['LA3027 / LA3528 / LA8072', 1],
      ['LA8186', 2],
      ['DL2702 / LA8185', 3],
      ['', 4],
    ],
  };

  it('filters json-values by --match (case-insensitive regex on value)', async () => {
    mockClient.getEventJsonValues.mockResolvedValueOnce(columnarValues);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-values',
      '--event-type',
      'goal',
      '--path',
      'items/0/segment_flight_number',
      '--match',
      'la8186|la8153',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ value: unknown }>;
    expect(printed.map((r) => r.value)).toEqual(['LA8186']);
  });

  it('passes json-values output through unchanged when no --match is set', async () => {
    mockClient.getEventJsonValues.mockResolvedValueOnce(columnarValues);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-values',
      '--event-type',
      'goal',
      '--path',
      'items/0/segment_flight_number',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as unknown[];
    expect(printed.length).toBe(4);
  });

  it('should get event json layouts', async () => {
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_attribute',
      '--phase',
      'after_enrichment',
    ]);

    expect(mockClient.getEventJsonLayouts).toHaveBeenCalledWith({
      source: 'unit_attribute',
      phase: 'after_enrichment',
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  const columnarLayouts = {
    columnNames: ['key', 'value_type', 'last_event_at'],
    columnTypes: ['String', 'String', 'Int64'],
    rows: [
      ['currency', 'string', 1],
      ['items', 'array', 2],
      ['items/0', 'object', 3],
      ['items/0/segment_flight_number', 'string', 4],
      ['pageName', 'string', 5],
    ],
  };

  it('filters json-layouts paths by --match (case-insensitive regex)', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
      '--match',
      'PAGE|segment_flight',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ key: unknown }>;
    expect(printed.map((r) => r.key)).toEqual(['items/0/segment_flight_number', 'pageName']);
  });

  it('filters json-layouts paths by --top-level', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
      '--top-level',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ key: unknown }>;
    expect(printed.map((r) => r.key)).toEqual(['currency', 'items', 'pageName']);
  });

  it('filters json-layouts paths by --max-depth', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
      '--max-depth',
      '2',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<{ key: unknown }>;
    expect(printed.map((r) => r.key)).toEqual(['currency', 'items', 'items/0', 'pageName']);
  });

  it('passes json-layouts output through unchanged when no client filter is set', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as unknown[];
    expect(printed.length).toBe(5);
  });

  it('renders json-layouts as row objects (table) by default', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(printed)).toBe(true);
    expect(printed[0]).toEqual({
      key: 'currency',
      value_type: 'string',
      last_event_at: formatDateTime(1),
    });
  });

  it('keeps the columnar shape for json-layouts with --raw', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ raw: true, output: 'json' } as any);
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-layouts',
      '--source',
      'unit_goal_property',
      '--phase',
      'after_enrichment',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as {
      columnNames: string[];
      rows: unknown[][];
    };
    expect(printed.columnNames).toEqual(['key', 'value_type', 'last_event_at']);
    expect(printed.rows.length).toBe(5);
  });

  it('keeps the columnar shape for json-values with --raw', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ raw: true, output: 'json' } as any);
    mockClient.getEventJsonValues.mockResolvedValueOnce(columnarValues);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'json-values',
      '--event-type',
      'goal',
      '--path',
      'items/0/segment_flight_number',
    ]);
    const printed = vi.mocked(printFormatted).mock.calls.at(-1)?.[0] as {
      columnNames: string[];
      rows: unknown[][];
    };
    expect(printed.columnNames).toEqual(['value', 'last_event_at']);
    expect(printed.rows.length).toBe(4);
  });

  it('rejects an invalid --match regex with a clear error', async () => {
    mockClient.getEventJsonLayouts.mockResolvedValueOnce(columnarLayouts);
    try {
      await eventsCommand.parseAsync([
        'node',
        'test',
        'json-layouts',
        '--source',
        'unit_goal_property',
        '--phase',
        'after_enrichment',
        '--match',
        '(',
      ]);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error as Error).message.startsWith('process.exit')) throw error;
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('Invalid --match regex');
    }
  });

  it('should error on unit-data with invalid format (no colon)', async () => {
    await expect(
      eventsCommand.parseAsync(['node', 'test', 'unit-data', 'invalidformat'])
    ).rejects.toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Invalid unit format')
    );
  });

  it('should error on unit-data with non-numeric unit_type_id', async () => {
    await expect(
      eventsCommand.parseAsync(['node', 'test', 'unit-data', 'abc:user123'])
    ).rejects.toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Invalid unit_type_id')
    );
  });

  it('should run events summary with default args', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'summary']);
    expect(mockClient.getEventsSummary).toHaveBeenCalledWith({});
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should pass from/to to events summary', async () => {
    await eventsCommand.parseAsync(['node', 'test', 'summary', '--from', '1000', '--to', '2000']);
    expect(mockClient.getEventsSummary).toHaveBeenCalledWith({ from: 1000, to: 2000 });
  });

  it('should reject invalid --period', async () => {
    await expect(
      eventsCommand.parseAsync(['node', 'test', 'summary', '--period', 'hour'])
    ).rejects.toThrow();
  });

  it('should print raw payload when --raw is set', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ output: 'table', raw: true } as any);
    await eventsCommand.parseAsync(['node', 'test', 'summary']);
    expect(printFormatted).toHaveBeenCalled();
    // --raw passes the API payload through untouched.
    const arg = vi.mocked(printFormatted).mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toHaveProperty('events');
    expect(arg).toHaveProperty('teams');
    expect(arg).not.toHaveProperty('rows');
  });

  it('should print aggregated rollup when -o json is set', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ output: 'json' } as any);
    await eventsCommand.parseAsync(['node', 'test', 'summary']);
    expect(printFormatted).toHaveBeenCalled();
    const arg = vi.mocked(printFormatted).mock.calls[0]![0] as Record<string, unknown>;
    // The serialized rollup contains the aggregated rows + metadata,
    // not the raw API columns.
    expect(arg).toHaveProperty('period');
    expect(arg).toHaveProperty('rows');
    expect(arg).toHaveProperty('teams');
    expect(arg.transposed).toBe(false);
    expect(Array.isArray(arg.rows)).toBe(true);
    // Each row's team entries should carry the human-readable name
    // alongside the counts so consumers don't need to cross-reference.
    const rows = arg.rows as Array<{ teams: Record<string, { name: string }> }>;
    const firstRow = rows[0]!;
    expect(firstRow.teams['1']).toMatchObject({ name: 'Growth' });
  });

  it('should produce transposed JSON when --transpose -o json', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ output: 'json' } as any);
    await eventsCommand.parseAsync([
      'node',
      'test',
      'summary',
      '--transpose',
      '--group-by',
      'team',
    ]);
    const arg = vi.mocked(printFormatted).mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.transposed).toBe(true);
    expect(arg).toHaveProperty('periods');
    const rows = arg.rows as Array<{
      team_id: number;
      name: string;
      periods: Record<string, unknown>;
    }>;
    // Each row is now a team
    expect(rows[0]).toHaveProperty('team_id');
    expect(rows[0]).toHaveProperty('name');
    expect(rows[0]).toHaveProperty('periods');
    expect(typeof rows[0]!.periods).toBe('object');
  });
});
