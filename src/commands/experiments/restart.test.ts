import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server.js';
import { createAPIClient } from '../../lib/api/client.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';
import { restartCommand } from './restart.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});

const BASE_URL = TEST_BASE_URL;

describe.skipIf(isLiveMode)('experiments restart API', () => {
  const client = createAPIClient(BASE_URL, TEST_API_KEY);

  const mockExperiment = {
    id: 42,
    name: 'test_exp',
    display_name: 'Test',
    state: 'stopped',
    iteration: 1,
    percentage_of_traffic: 100,
    nr_variants: 2,
    percentages: '50/50',
    audience: '{}',
    audience_strict: false,
    type: 'test',
    analysis_type: 'group_sequential',
    required_alpha: '0.1',
    required_power: '0.8',
    group_sequential_futility_type: 'binding',
    group_sequential_min_analysis_interval: '1d',
    group_sequential_first_analysis_interval: '7d',
    group_sequential_max_duration_interval: '6w',
  };

  const mockFeatureExperiment = {
    ...mockExperiment,
    type: 'feature',
    analysis_type: null,
    required_alpha: null,
    required_power: null,
    group_sequential_futility_type: null,
    group_sequential_min_analysis_interval: null,
    group_sequential_first_analysis_interval: null,
    group_sequential_max_duration_interval: null,
  };

  function useGetHandler(experiment = mockExperiment) {
    server.use(
      http.get(`${BASE_URL}/experiments/:id`, () =>
        HttpResponse.json({ ok: true, experiment, errors: [] })
      )
    );
  }

  function useRestartHandler(captureBody: (body: Record<string, unknown>) => void) {
    server.use(
      http.put(`${BASE_URL}/experiments/:id/restart`, async ({ request }) => {
        captureBody((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'stopped' },
          new_experiment: { id: 43, state: 'development' },
          errors: [],
        });
      })
    );
  }

  it('should GET experiment then PUT to /experiments/:id/restart with data', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    useGetHandler();
    useRestartHandler((body) => {
      receivedBody = body;
    });

    await client.restartExperiment(42 as any, { note: 'Restarting experiment' });

    expect(receivedBody).toBeDefined();
    expect(receivedBody!.data).toBeDefined();
    expect((receivedBody!.data as Record<string, unknown>).name).toBe('test_exp');
    expect(receivedBody!.note).toBe('Restarting experiment');
    expect(receivedBody!.state).toBe('running');
    expect(receivedBody!.reshuffle).toBe(false);
    expect(receivedBody!.version).toBeDefined();
  });

  it('should send optional fields when provided', async () => {
    let receivedBody: Record<string, unknown> | null = null;
    useGetHandler();
    useRestartHandler((body) => {
      receivedBody = body;
    });

    await client.restartExperiment(42 as any, {
      note: 'Restarting',
      reason: 'testing',
      reshuffle: true,
      state: 'development',
    });

    expect(receivedBody!.note).toBe('Restarting');
    expect(receivedBody!.reason).toBe('testing');
    expect(receivedBody!.reshuffle).toBe(true);
    expect(receivedBody!.state).toBe('development');
    expect(receivedBody!.data).toBeDefined();
  });

  it('should return new_experiment when present in response', async () => {
    useGetHandler();
    useRestartHandler(() => {});

    const result = await client.restartExperiment(42 as any);

    expect(result.id).toBe(43);
    expect(result.state).toBe('development');
  });

  it('should fall back to experiment when new_experiment is absent', async () => {
    useGetHandler();
    server.use(
      http.put(`${BASE_URL}/experiments/:id/restart`, async () =>
        HttpResponse.json({
          ok: true,
          experiment: { id: 42, state: 'running' },
          errors: [],
        })
      )
    );

    const result = await client.restartExperiment(42 as any);

    expect(result.id).toBe(42);
    expect(result.state).toBe('running');
  });

  it('should throw when response has ok: false', async () => {
    useGetHandler();
    server.use(
      http.put(`${BASE_URL}/experiments/:id/restart`, async () =>
        HttpResponse.json({
          ok: false,
          experiment: { id: 42, state: 'stopped' },
          errors: ['A reason for restarting is required.'],
        })
      )
    );

    await expect(client.restartExperiment(42 as any)).rejects.toThrow(
      'A reason for restarting is required'
    );
  });

  describe('restart_as_type: feature (test → feature)', () => {
    it('should set data.type to "feature" and null analysis fields', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      useGetHandler(mockExperiment);
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, { restart_as_type: 'feature' });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.type).toBe('feature');
      expect(data.analysis_type).toBeNull();
      expect(data.required_alpha).toBeNull();
      expect(data.required_power).toBeNull();
      expect(data.group_sequential_futility_type).toBeNull();
      expect(data.group_sequential_analysis_count).toBeNull();
      expect(data.group_sequential_min_analysis_interval).toBeNull();
      expect(data.group_sequential_first_analysis_interval).toBeNull();
      expect(data.group_sequential_max_duration_interval).toBeNull();
      expect(data.minimum_detectable_effect).toBeNull();
      expect(data.baseline_primary_metric_mean).toBeNull();
      expect(data.baseline_primary_metric_stdev).toBeNull();
      expect(data.baseline_participants_per_day).toBeNull();
      expect(receivedBody!.restart_as_type).toBe('feature');
    });

    it('should preserve non-analysis fields when converting to feature', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      useGetHandler(mockExperiment);
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, { restart_as_type: 'feature' });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.name).toBe('test_exp');
      expect(data.display_name).toBe('Test');
      expect(data.percentage_of_traffic).toBe(100);
    });
  });

  describe('restart_as_type: experiment (feature → test)', () => {
    it('should map "experiment" to "test" in data.type', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      useGetHandler(mockFeatureExperiment);
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, { restart_as_type: 'experiment' });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.type).toBe('test');
      expect(receivedBody!.restart_as_type).toBe('experiment');
    });

    it('should set default analysis fields when feature has none', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      useGetHandler(mockFeatureExperiment);
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, { restart_as_type: 'experiment' });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.analysis_type).toBe('group_sequential');
      expect(data.required_alpha).toBe('0.1');
      expect(data.required_power).toBe('0.8');
      expect(data.group_sequential_futility_type).toBe('binding');
      expect(data.group_sequential_min_analysis_interval).toBe('1d');
      expect(data.group_sequential_first_analysis_interval).toBe('7d');
      expect(data.group_sequential_max_duration_interval).toBe('6w');
    });

    it('should not overwrite existing analysis fields when converting to test', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      const featureWithAnalysis = {
        ...mockFeatureExperiment,
        analysis_type: 'fixed_horizon',
        required_alpha: '0.05',
        required_power: '0.9',
      };
      useGetHandler(featureWithAnalysis);
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, { restart_as_type: 'experiment' });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.type).toBe('test');
      expect(data.analysis_type).toBe('fixed_horizon');
      expect(data.required_alpha).toBe('0.05');
      expect(data.required_power).toBe('0.9');
    });
  });

  describe('changes option', () => {
    it('should merge changes into the transformed experiment data', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      useGetHandler();
      useRestartHandler((body) => {
        receivedBody = body;
      });

      await client.restartExperiment(42 as any, {
        changes: { display_name: 'Updated on restart' } as any,
      });

      const data = receivedBody!.data as Record<string, unknown>;
      expect(data.display_name).toBe('Updated on restart');
      expect(data.name).toBe('test_exp');
    });
  });
});

describe('restart command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    restartExperiment: vi.fn().mockResolvedValue({ id: 42, state: 'running' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(restartCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
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

  it('should restart with default options', async () => {
    await restartCommand.parseAsync(['node', 'test', '42']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ note: 'Restarted via CLI', state: 'running' })
    );
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Experiment 42 restarted');
  });

  it.skipIf(isLiveMode)(
    'lets the global --dry-run short-circuit at the API client (no local flag)',
    async () => {
      vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: true } as any);
      const dryRunClient = createAPIClient(BASE_URL, TEST_API_KEY, { dryRun: true });
      vi.mocked(getAPIClientFromOptions).mockResolvedValue(dryRunClient as any);
      let restartHit = false;
      server.use(
        http.get(`${BASE_URL}/experiments/:id`, () =>
          HttpResponse.json({
            ok: true,
            experiment: {
              id: 42,
              name: 'test_exp',
              display_name: 'Test',
              state: 'stopped',
              iteration: 1,
              type: 'test',
            },
            errors: [],
          })
        ),
        http.put(`${BASE_URL}/experiments/:id/restart`, () => {
          restartHit = true;
          return HttpResponse.json(
            { ok: false, errors: ['should not be reached'] },
            { status: 500 }
          );
        })
      );

      await restartCommand.parseAsync(['node', 'test', '42']);

      const output = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Dry run');
      expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('Dry run');
      expect(restartHit).toBe(false);
      expect(processExitSpy).not.toHaveBeenCalled();
    }
  );

  it('has no local --dry-run option (superseded by global --dry-run)', () => {
    const optionNames = restartCommand.options.map((o) => o.long);
    expect(optionNames).not.toContain('--dry-run');
  });

  it('should pass custom --reason', async () => {
    await restartCommand.parseAsync(['node', 'test', '42', '--reason', 'other']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ reason: 'other' })
    );
  });

  it('should reject invalid --reason', async () => {
    try {
      await restartCommand.parseAsync(['node', 'test', '42', '--reason', 'bad_reason']);
      throw new Error('Should have thrown');
    } catch (error) {
      if ((error as Error).message.startsWith('process.exit')) {
        const output = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(output).toContain('Invalid reason');
        expect(output).toContain('Valid reasons');
      } else {
        throw error;
      }
    }
  });

  it('should pass --state development', async () => {
    await restartCommand.parseAsync(['node', 'test', '42', '--state', 'development']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ state: 'development' })
    );
  });

  it('should reject invalid --state', async () => {
    try {
      await restartCommand.parseAsync(['node', 'test', '42', '--state', 'bad_state']);
      throw new Error('Should have thrown');
    } catch (error) {
      if ((error as Error).message.startsWith('process.exit')) {
        const output = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(output).toContain('Invalid state');
        expect(output).toContain('Valid states: running, development');
      } else {
        throw error;
      }
    }
  });

  it('should pass --reshuffle flag', async () => {
    await restartCommand.parseAsync(['node', 'test', '42', '--reshuffle']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ reshuffle: true })
    );
  });

  it('should pass --as-type feature', async () => {
    await restartCommand.parseAsync(['node', 'test', '42', '--as-type', 'feature']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ restart_as_type: 'feature' })
    );
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('restarted as feature');
  });

  it('should pass --as-type experiment', async () => {
    await restartCommand.parseAsync(['node', 'test', '42', '--as-type', 'experiment']);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ restart_as_type: 'experiment' })
    );
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('restarted as experiment');
  });

  it('should reject invalid --as-type', async () => {
    try {
      await restartCommand.parseAsync(['node', 'test', '42', '--as-type', 'bad_type']);
      throw new Error('Should have thrown');
    } catch (error) {
      if ((error as Error).message.startsWith('process.exit')) {
        const output = consoleErrorSpy.mock.calls.flat().join(' ');
        expect(output).toContain('Invalid type');
        expect(output).toContain('Valid types: feature, experiment');
      } else {
        throw error;
      }
    }
  });

  it('should show plain message when no --as-type', async () => {
    await restartCommand.parseAsync(['node', 'test', '42']);

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Experiment 42 restarted');
    expect(output).not.toContain('as feature');
    expect(output).not.toContain('as experiment');
  });

  it('should combine --as-type with other options', async () => {
    await restartCommand.parseAsync([
      'node',
      'test',
      '42',
      '--as-type',
      'feature',
      '--state',
      'development',
      '--reshuffle',
      '--note',
      'Converting to feature flag',
    ]);

    expect(mockClient.restartExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        restart_as_type: 'feature',
        state: 'development',
        reshuffle: true,
        note: 'Converting to feature flag',
      })
    );
  });
});
