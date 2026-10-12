import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloneCommand } from './clone.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  resolveEndpoint,
  resolveAPIKey,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';
import { DryRunError } from '../../api-client/http-client.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    resolveEndpoint: vi.fn(),
    resolveAPIKey: vi.fn(),
  };
});

vi.mock('../../api-client/template/serializer.js', () => ({
  experimentToMarkdown: vi.fn().mockResolvedValue('# Experiment\nname: original'),
}));

vi.mock('../../api-client/template/parser.js', () => ({
  parseExperimentMarkdown: vi.fn().mockReturnValue({
    name: 'original',
    display_name: 'Original',
    type: 'test',
    state: 'created',
    variants: [],
  }),
}));

vi.mock('../../api-client/template/build-from-template.js', () => ({
  buildPayloadFromTemplate: vi.fn().mockResolvedValue({
    payload: { name: 'cloned' },
    warnings: [],
  }),
}));

vi.mock('../../lib/template/parser.js', () => ({
  parseExperimentFile: vi.fn(),
}));

vi.mock('../../api-client/template/merge-overrides.js', () => ({
  mergeTemplateOverrides: vi.fn().mockImplementation((base: unknown) => base),
}));

vi.mock('../../lib/interactive/run.js', () => ({
  runInteractiveEditor: vi.fn(),
}));

vi.mock('./default-type.js', () => ({
  getDefaultType: vi.fn().mockReturnValue('test'),
}));

describe('clone command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    getExperiment: vi.fn().mockResolvedValue({
      id: 100,
      name: 'original',
      type: 'test',
      variant_screenshots: [],
    }),
    createExperiment: vi.fn().mockResolvedValue({
      id: 200,
      name: 'cloned',
      type: 'test',
    }),
    listApplications: vi.fn().mockResolvedValue([]),
    listUnitTypes: vi.fn().mockResolvedValue([]),
    listMetrics: vi.fn().mockResolvedValue([]),
    listCustomSectionFields: vi.fn().mockResolvedValue([]),
    listUsers: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn().mockResolvedValue([]),
    listExperimentTags: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(cloneCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    vi.mocked(resolveEndpoint).mockReturnValue('https://api.example.com/v1');
    vi.mocked(resolveAPIKey).mockResolvedValue('test-key');
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

  it('clones an experiment with --name', async () => {
    await cloneCommand.parseAsync(['node', 'test', '100', '--name', 'my_clone']);

    expect(mockClient.getExperiment).toHaveBeenCalledWith(100);
    expect(mockClient.createExperiment).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cloned'));
  });

  it('fails without --name', async () => {
    await expect(cloneCommand.parseAsync(['node', 'test', '100'])).rejects.toThrow('process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('--name is required')
    );
    expect(mockClient.createExperiment).not.toHaveBeenCalled();
  });

  it('lets the global --dry-run short-circuit at the API client (no local flag)', async () => {
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: true } as any);
    mockClient.createExperiment.mockRejectedValueOnce(new DryRunError('POST', '/experiments'));

    await cloneCommand.parseAsync(['node', 'test', '100', '--name', 'my_clone']);

    expect(mockClient.createExperiment).toHaveBeenCalledOnce();
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Dry run');
  });

  it('has no local --dry-run option (superseded by global --dry-run)', () => {
    const optionNames = cloneCommand.options.map((o) => o.long);
    expect(optionNames).not.toContain('--dry-run');
  });
});
