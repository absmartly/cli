import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateCommand } from './update.js';
import { getAPIClientFromOptions, getGlobalOptions } from '../../lib/utils/api-helper.js';
import { readTemplateFile } from '../../lib/template/parser.js';
import { parseExperimentMarkdown } from '../../api-client/template/parser.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { DryRunError } from '../../api-client/http-client.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return { ...actual, getAPIClientFromOptions: vi.fn(), getGlobalOptions: vi.fn() };
});
vi.mock('../../lib/template/parser.js');
vi.mock('../../api-client/template/parser.js');

describe('update command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    resolveExperimentId: vi.fn().mockImplementation((v: string) => Promise.resolve(Number(v))),
    updateExperiment: vi.fn().mockResolvedValue({ id: 42 }),
    getExperiment: vi.fn().mockResolvedValue({ id: 42, name: 'test' }),
    listApplications: vi.fn().mockResolvedValue([]),
    listUnitTypes: vi.fn().mockResolvedValue([]),
    listMetrics: vi.fn().mockResolvedValue([]),
    listCustomSectionFields: vi.fn().mockResolvedValue([]),
    listUsers: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn().mockResolvedValue([
      { id: 1, name: 'Product' },
      { id: 2, name: 'Engineering' },
    ]),
    listExperimentTags: vi.fn().mockResolvedValue([
      { id: 10, tag: 'v1' },
      { id: 11, tag: 'mobile' },
    ]),
    resolveMetrics: vi
      .fn()
      .mockImplementation((names: string[]) =>
        Promise.resolve(names.map((n, i) => ({ id: i + 1, name: n })))
      ),
    resolveTeams: vi.fn().mockImplementation((names: string[]) => {
      const teams = [
        { id: 1, name: 'Product' },
        { id: 2, name: 'Engineering' },
      ];
      return Promise.resolve(
        names.map((n) => {
          const t = teams.find((t) => t.name.toLowerCase() === n.toLowerCase());
          if (!t) throw new Error(`Team "${n}" not found`);
          return t;
        })
      );
    }),
    resolveTags: vi.fn().mockImplementation((names: string[]) => {
      const tags = [
        { id: 10, tag: 'v1' },
        { id: 11, tag: 'mobile' },
      ];
      return Promise.resolve(
        names.map((n) => {
          const t = tags.find((t) => t.tag.toLowerCase() === n.toLowerCase());
          if (!t) throw new Error(`Tag "${n}" not found`);
          return t;
        })
      );
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(updateCommand);
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

  it('should update display name', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--display-name', 'New Name']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ display_name: 'New Name' }),
      undefined
    );
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Experiment 42 updated');
  });

  it('should update name', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--name', 'new-name']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ name: 'new-name' }),
      undefined
    );
  });

  it('should update traffic percentage', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--percentage-of-traffic', '50']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ percentage_of_traffic: 50 }),
      undefined
    );
  });

  it('should update state', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--state', 'running']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ state: 'running' }),
      undefined
    );
  });

  it('should update primary metric', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--primary-metric', '145']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ primary_metric: { metric_id: 145 } }),
      undefined
    );
  });

  it('should update unit type', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--unit-type', '3']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ unit_type: { unit_type_id: 3 } }),
      undefined
    );
  });

  it('should update application', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--application-id', '5']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ applications: [{ application_id: 5, application_version: '0' }] }),
      undefined
    );
  });

  it('should update variants', async () => {
    await updateCommand.parseAsync([
      'node',
      'test',
      '42',
      '--variants',
      'control,treatment,treatment2',
    ]);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        nr_variants: 3,
        variants: [
          { name: 'control', variant: 0, config: '{}' },
          { name: 'treatment', variant: 1, config: '{}' },
          { name: 'treatment2', variant: 2, config: '{}' },
        ],
      }),
      undefined
    );
  });

  it('should update percentages', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--percentages', '30,70']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ percentages: '30/70' }),
      undefined
    );
  });

  it('should update owners', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--owner', '10', '--owner', '20']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ owners: [{ user_id: 10 }, { user_id: 20 }] }),
      undefined
    );
  });

  it('should update teams by name', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--teams', 'Product,Engineering']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ teams: [{ team_id: 1 }, { team_id: 2 }] }),
      undefined
    );
  });

  it('should update tags by name', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--tags', 'v1,mobile']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        experiment_tags: [{ experiment_tag_id: 10 }, { experiment_tag_id: 11 }],
      }),
      undefined
    );
  });

  it('should update audience', async () => {
    const audience = '{"filter":[{"and":[]}]}';
    await updateCommand.parseAsync(['node', 'test', '42', '--audience', audience]);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ audience }),
      undefined
    );
  });

  it('should update analysis type', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--analysis-type', 'fixed_horizon']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ analysis_type: 'fixed_horizon' }),
      undefined
    );
  });

  it('should update required alpha and power', async () => {
    await updateCommand.parseAsync([
      'node',
      'test',
      '42',
      '--required-alpha',
      '0.05',
      '--required-power',
      '0.9',
    ]);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ required_alpha: '0.05', required_power: '0.9' }),
      undefined
    );
  });

  it('should update baseline participants', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--baseline-participants', '100']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ baseline_participants_per_day: '100' }),
      undefined
    );
  });

  it('should update secondary metrics', async () => {
    mockClient.resolveMetrics.mockResolvedValue([
      { id: 10, name: 'Revenue' },
      { id: 20, name: 'Bookings' },
    ]);

    await updateCommand.parseAsync([
      'node',
      'test',
      '42',
      '--secondary-metrics',
      'Revenue,Bookings',
    ]);

    expect(mockClient.resolveMetrics).toHaveBeenCalledWith(['Revenue', 'Bookings']);
    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        secondary_metrics: [
          { metric_id: 10, type: 'secondary', order_index: 0 },
          { metric_id: 20, type: 'secondary', order_index: 1 },
        ],
      }),
      undefined
    );
  });

  it('should update from template file', async () => {
    vi.mocked(readTemplateFile).mockReturnValue('---\nname: test\n---\n');
    vi.mocked(parseExperimentMarkdown).mockReturnValue({
      display_name: 'Template Name',
      percentage_of_traffic: 75,
      state: 'running',
    });

    await updateCommand.parseAsync(['node', 'test', '42', '--from-file', 'template.md']);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        display_name: 'Template Name',
        percentage_of_traffic: 75,
        state: 'running',
      }),
      undefined
    );
  });

  it('lets the global --dry-run short-circuit at the API client (no local flag)', async () => {
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: true } as any);
    mockClient.updateExperiment.mockRejectedValueOnce(new DryRunError('PUT', '/experiments/42'));

    await updateCommand.parseAsync(['node', 'test', '42', '--display-name', 'Test']);

    expect(mockClient.updateExperiment).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Dry run');
  });

  it('has no local --dry-run option (superseded by global --dry-run)', () => {
    const optionNames = updateCommand.options.map((o) => o.long);
    expect(optionNames).not.toContain('--dry-run');
  });

  it('should pass --note to updateExperiment', async () => {
    await updateCommand.parseAsync([
      'node',
      'test',
      '42',
      '--display-name',
      'New Name',
      '--note',
      'my update note',
    ]);

    expect(mockClient.updateExperiment).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ display_name: 'New Name' }),
      { note: 'my update note' }
    );
  });

  it('should pass partial changes only', async () => {
    await updateCommand.parseAsync(['node', 'test', '42', '--display-name', 'Partial']);

    const changes = mockClient.updateExperiment.mock.calls[0]![1];
    expect(changes).toEqual({ display_name: 'Partial' });
  });
});
