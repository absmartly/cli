import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { datasourcesCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { PassThrough } from 'node:stream';
import { setTTYOverride } from '../../lib/utils/stdin.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('datasources command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listDatasources: vi.fn().mockResolvedValue([{ id: 1, name: 'ds1' }]),
    getDatasource: vi.fn().mockResolvedValue({ id: 1, name: 'ds1' }),
    createDatasource: vi.fn().mockResolvedValue({ id: 2 }),
    updateDatasource: vi.fn().mockResolvedValue({ id: 1 }),
    archiveDatasource: vi.fn().mockResolvedValue(undefined),
    testDatasource: vi.fn().mockResolvedValue(undefined),
    introspectDatasource: vi.fn().mockResolvedValue({ schema: [] }),
    validateDatasourceQuery: vi.fn().mockResolvedValue(undefined),
    previewDatasourceQuery: vi.fn().mockResolvedValue({
      columnNames: ['experiment_id', 'cnt'],
      columnTypes: ['INT64', 'INT64'],
      rows: [
        [1, 538217],
        [5, 250000],
      ],
    }),
    setDefaultDatasource: vi.fn().mockResolvedValue(undefined),
    getDatasourceSchema: vi.fn().mockResolvedValue({ tables: [] }),
    deleteDatasource: vi.fn().mockResolvedValue(undefined),
    createDatasourceJsonLayouts: vi.fn().mockResolvedValue(undefined),
    recreateDatasourceJsonLayouts: vi.fn().mockResolvedValue(undefined),
    previewDatasourceJsonLayouts: vi.fn().mockResolvedValue({
      ok: true,
      row_count: 0,
      column_names: [],
      column_types: [],
      rows: [],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(datasourcesCommand);
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

  it('should list datasources', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listDatasources).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list datasources with pagination', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'list', '--items', '10', '--page', '2']);

    expect(mockClient.listDatasources).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should get datasource by id', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getDatasource).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create a datasource', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'create',
      '--json-config',
      '{"type":"clickhouse"}',
    ]);

    expect(mockClient.createDatasource).toHaveBeenCalledWith({ type: 'clickhouse' });
  });

  it('should update a datasource', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--json-config',
      '{"type":"clickhouse"}',
    ]);

    expect(mockClient.updateDatasource).toHaveBeenCalledWith(1, { type: 'clickhouse' });
  });

  it('should archive a datasource', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'archive', '1']);

    expect(mockClient.archiveDatasource).toHaveBeenCalledWith(1, false);
  });

  it('should unarchive a datasource', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'archive', '1', '--unarchive']);

    expect(mockClient.archiveDatasource).toHaveBeenCalledWith(1, true);
  });

  it('should test a datasource', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'test',
      '--json-config',
      '{"type":"clickhouse"}',
    ]);

    expect(mockClient.testDatasource).toHaveBeenCalledWith({ type: 'clickhouse' });
  });

  it('should introspect a datasource', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'introspect',
      '--json-config',
      '{"type":"clickhouse"}',
    ]);

    expect(mockClient.introspectDatasource).toHaveBeenCalledWith({ type: 'clickhouse' });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should validate a datasource query', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'validate-query',
      '--json-config',
      '{"query":"SELECT 1"}',
    ]);

    expect(mockClient.validateDatasourceQuery).toHaveBeenCalledWith({ query: 'SELECT 1' });
  });

  it('should preview a datasource query and reshape columnar response to rows', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'preview-query',
      '--json-config',
      '{"query":"SELECT 1"}',
    ]);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({ query: 'SELECT 1' });
    expect(printFormatted).toHaveBeenCalledWith(
      [
        { experiment_id: 1, cnt: 538217 },
        { experiment_id: 5, cnt: 250000 },
      ],
      expect.anything()
    );
  });

  it('should preview a datasource query with --raw and keep the columnar shape', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ output: 'table', raw: true } as any);

    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'preview-query',
      '--json-config',
      '{"query":"SELECT 1"}',
    ]);

    expect(printFormatted).toHaveBeenCalledWith(
      {
        columnNames: ['experiment_id', 'cnt'],
        columnTypes: ['INT64', 'INT64'],
        rows: [
          [1, 538217],
          [5, 250000],
        ],
      },
      expect.anything()
    );
  });

  it('should set default datasource', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'set-default', '1']);

    expect(mockClient.setDefaultDatasource).toHaveBeenCalledWith(1);
  });

  it('should get datasource schema', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'schema', '1']);

    expect(mockClient.getDatasourceSchema).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should delete a datasource', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'delete', '1']);

    expect(mockClient.deleteDatasource).toHaveBeenCalledWith(1);
  });

  it('should create json_layouts table', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'json-layouts', 'create', '1']);

    expect(mockClient.createDatasourceJsonLayouts).toHaveBeenCalledWith(1);
  });

  it('should preview json_layouts table', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'json-layouts', 'preview', '1']);

    expect(mockClient.previewDatasourceJsonLayouts).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should recreate json_layouts table when --yes is passed', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'json-layouts', 'recreate', '1', '--yes']);

    expect(mockClient.recreateDatasourceJsonLayouts).toHaveBeenCalledWith(1);
  });

  it('should refuse to recreate json_layouts table without --yes', async () => {
    await expect(
      datasourcesCommand.parseAsync(['node', 'test', 'json-layouts', 'recreate', '1'])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.recreateDatasourceJsonLayouts).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--yes'));
  });

  it('should run query with positional SQL and reshape the response', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', 'SELECT 1 AS one']);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({
      datasource_id: 6,
      query: 'SELECT 1 AS one',
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should run query with --sql flag', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', '--sql', 'SELECT 2 AS two']);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({
      datasource_id: 6,
      query: 'SELECT 2 AS two',
    });
  });

  it('should reject when both positional sql and --sql are provided', async () => {
    await expect(
      datasourcesCommand.parseAsync(['node', 'test', 'query', '6', 'SELECT 1', '--sql', 'SELECT 2'])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--sql'));
  });

  it('should pass --limit through to the request body', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'query',
      '6',
      'SELECT 1',
      '--limit',
      '20',
    ]);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({
      datasource_id: 6,
      query: 'SELECT 1',
      limit: 20,
    });
  });

  it('should omit limit from the body when --limit is not set', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', 'SELECT 1']);

    const call = mockClient.previewDatasourceQuery.mock.calls[0]?.[0];
    expect(call).not.toHaveProperty('limit');
  });

  it('re-exports columnarToRows from core/datasources', async () => {
    const mod = await import('../../core/datasources/datasources.js');
    expect(typeof (mod as { columnarToRows?: unknown }).columnarToRows).toBe('function');
  });

  it('query reshapes columnar response to rows by default', async () => {
    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', 'SELECT 1']);

    expect(printFormatted).toHaveBeenCalledWith(
      [
        { experiment_id: 1, cnt: 538217 },
        { experiment_id: 5, cnt: 250000 },
      ],
      expect.anything()
    );
  });

  it('query --raw preserves the columnar response', async () => {
    vi.mocked(getGlobalOptions).mockReturnValueOnce({ output: 'table', raw: true } as any);

    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', 'SELECT 1']);

    expect(printFormatted).toHaveBeenCalledWith(
      {
        columnNames: ['experiment_id', 'cnt'],
        columnTypes: ['INT64', 'INT64'],
        rows: [
          [1, 538217],
          [5, 250000],
        ],
      },
      expect.anything()
    );
  });

  it('should accept --json-config as the full body when no other inputs are present', async () => {
    await datasourcesCommand.parseAsync([
      'node',
      'test',
      'query',
      '6',
      '--json-config',
      '{"datasource_id":6,"query":"SELECT 1","limit":3}',
    ]);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({
      datasource_id: 6,
      query: 'SELECT 1',
      limit: 3,
    });
  });

  it('should reject --json-config combined with positional sql', async () => {
    await expect(
      datasourcesCommand.parseAsync([
        'node',
        'test',
        'query',
        '6',
        'SELECT 1',
        '--json-config',
        '{"query":"SELECT 1"}',
      ])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
  });

  it('should reject --json-config combined with --sql', async () => {
    await expect(
      datasourcesCommand.parseAsync([
        'node',
        'test',
        'query',
        '6',
        '--sql',
        'SELECT 1',
        '--json-config',
        '{"query":"SELECT 1"}',
      ])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
  });

  it('should reject --json-config combined with --limit', async () => {
    await expect(
      datasourcesCommand.parseAsync([
        'node',
        'test',
        'query',
        '6',
        '--limit',
        '5',
        '--json-config',
        '{"query":"SELECT 1"}',
      ])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
  });

  it('should reject when no SQL source is provided', async () => {
    await expect(datasourcesCommand.parseAsync(['node', 'test', 'query', '6'])).rejects.toThrow(
      /process\.exit: 1/
    );

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
  });
});

describe('datasources query --sql -', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalStdin: typeof process.stdin;

  const mockClient = {
    previewDatasourceQuery: vi.fn().mockResolvedValue({
      columnNames: ['answer'],
      columnTypes: ['INT64'],
      rows: [[42]],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(datasourcesCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    vi.mocked(printFormatted).mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new Error(`process.exit: ${code}`);
    });
  });

  afterEach(() => {
    if (originalStdin) {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true,
      });
    }
    setTTYOverride({ stdin: true, stdout: true });
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  function replaceStdin(content: string): void {
    originalStdin = process.stdin;
    const stream = new PassThrough();
    stream.end(content);
    Object.defineProperty(process, 'stdin', {
      value: stream,
      configurable: true,
    });
    setTTYOverride({ stdin: false });
  }

  it('reads SQL from stdin when --sql is "-"', async () => {
    replaceStdin('SELECT 42 AS answer\n');
    await datasourcesCommand.parseAsync(['node', 'test', 'query', '6', '--sql', '-']);

    expect(mockClient.previewDatasourceQuery).toHaveBeenCalledWith({
      datasource_id: 6,
      query: 'SELECT 42 AS answer\n',
    });
  });

  it('errors when --sql is "-" but stdin is empty', async () => {
    replaceStdin('');
    await expect(
      datasourcesCommand.parseAsync(['node', 'test', 'query', '6', '--sql', '-'])
    ).rejects.toThrow(/process\.exit: 1/);

    expect(mockClient.previewDatasourceQuery).not.toHaveBeenCalled();
  });
});
