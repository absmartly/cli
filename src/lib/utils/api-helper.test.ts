import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../config/config', () => ({
  loadConfig: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock('../config/keyring', () => ({
  getAPIKey: vi.fn(),
  getOAuthToken: vi.fn(),
}));

vi.mock('../api/client', () => ({
  createAPIClient: vi.fn(),
}));

vi.mock('../output/formatter', () => ({
  formatOutput: vi.fn((data) => JSON.stringify(data)),
}));

import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
  printResult,
  shouldOutputIdsOnly,
  withErrorHandling,
  resolveAuth,
} from './api-helper.js';
import { loadConfig, getProfile } from '../config/config.js';
import { getAPIKey, getOAuthToken } from '../config/keyring.js';
import { createAPIClient } from '../api/client.js';
import { formatOutput } from '../output/formatter.js';
import { setTTYOverride } from './stdin.js';

describe('API Helper', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv.ABSMARTLY_API_KEY = process.env.ABSMARTLY_API_KEY;
    savedEnv.ABSMARTLY_API_ENDPOINT = process.env.ABSMARTLY_API_ENDPOINT;
    delete process.env.ABSMARTLY_API_KEY;
    delete process.env.ABSMARTLY_API_ENDPOINT;
  });

  afterEach(() => {
    if (savedEnv.ABSMARTLY_API_KEY !== undefined)
      process.env.ABSMARTLY_API_KEY = savedEnv.ABSMARTLY_API_KEY;
    else delete process.env.ABSMARTLY_API_KEY;
    if (savedEnv.ABSMARTLY_API_ENDPOINT !== undefined)
      process.env.ABSMARTLY_API_ENDPOINT = savedEnv.ABSMARTLY_API_ENDPOINT;
    else delete process.env.ABSMARTLY_API_ENDPOINT;
  });

  describe('getAPIClientFromOptions', () => {
    it('should throw error with helpful message when no API key found', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue(null);

      await expect(getAPIClientFromOptions({})).rejects.toThrow(
        /No API key found for profile "default"/
      );
      await expect(getAPIClientFromOptions({})).rejects.toThrow(/abs auth login/);
    });

    it('should throw error when no endpoint is configured', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: '' },
        expctld: { endpoint: '' },
      });

      await expect(getAPIClientFromOptions({})).rejects.toThrow(
        /No API endpoint configured for profile "default"/
      );
      await expect(getAPIClientFromOptions({})).rejects.toThrow(/abs auth login/);
    });

    it('should use profile-specific configuration', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://staging.api.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('staging-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({ profile: 'staging' });

      expect(getProfile).toHaveBeenCalledWith('staging');
      expect(getAPIKey).toHaveBeenCalledWith('staging');
      expect(createAPIClient).toHaveBeenCalledWith(
        'https://staging.api.com/v1',
        { method: 'api-key', apiKey: 'staging-key' },
        expect.objectContaining({ verbose: false, insecure: false })
      );
    });

    it('should prefer command-line apiKey over profile', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('profile-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({ apiKey: 'override-key' });

      expect(createAPIClient).toHaveBeenCalledWith(
        'https://api.absmartly.com/v1',
        { method: 'api-key', apiKey: 'override-key' },
        expect.any(Object)
      );
    });

    it('should prefer command-line endpoint over profile', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('test-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({ endpoint: 'https://custom.api.com/v1' });

      expect(createAPIClient).toHaveBeenCalledWith(
        'https://custom.api.com/v1',
        { method: 'api-key', apiKey: 'test-key' },
        expect.any(Object)
      );
    });

    it('should pass verbose flag to client', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('test-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({ verbose: true });

      expect(createAPIClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ verbose: true })
      );
    });

    it('should pass dryRun flag to client', async () => {
      (loadConfig as any).mockReturnValue({ 'default-profile': 'default' });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('test-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({ dryRun: true });

      expect(createAPIClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ dryRun: true })
      );
    });

    it('should use default profile when not specified', async () => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'production',
      });
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.absmartly.com/v1' },
        expctld: { endpoint: 'https://ctl.absmartly.io/v1' },
      });
      (getAPIKey as any).mockResolvedValue('prod-key');
      (createAPIClient as any).mockReturnValue({});

      await getAPIClientFromOptions({});

      expect(getProfile).toHaveBeenCalledWith('production');
      expect(getAPIKey).toHaveBeenCalledWith('production');
    });
  });

  describe('getGlobalOptions', () => {
    let mockCommand: Command;

    beforeEach(() => {
      mockCommand = new Command();
      mockCommand
        .option('--output <format>', 'output format', 'table')
        .option('--no-color', 'disable colors')
        .option('-v, --verbose', 'verbose')
        .option('--profile <name>', 'profile')
        .option('--terse', 'terse')
        .option('--full', 'full')
        .option('--show <fields...>', 'show')
        .option('--exclude <fields...>', 'exclude')
        .option('--show-only <fields...>', 'show only')
        .option('--show-request', 'show request')
        .option('--dry-run', 'dry run')
        .option('--curl', 'curl');
    });

    it('should parse options with defaults', () => {
      const options = getGlobalOptions(mockCommand);

      expect(options.output).toBe('table');
      expect(options.noColor).toBe(!process.stdout.isTTY);
      expect(options.verbose).toBe(false);
      expect(options.terse).toBe(false);
      expect(options.full).toBe(false);
    });

    it('should validate output format', () => {
      mockCommand.setOptionValue('output', 'invalid');

      expect(() => getGlobalOptions(mockCommand)).toThrow(/Invalid output format: 'invalid'/);
      expect(() => getGlobalOptions(mockCommand)).toThrow(
        /Must be one of: table, json, yaml, plain, markdown, rendered, template, vertical/
      );
    });

    it('should accept valid output formats', () => {
      const formats = ['table', 'json', 'yaml', 'plain', 'markdown', 'vertical'];

      for (const format of formats) {
        mockCommand.setOptionValue('output', format);
        const options = getGlobalOptions(mockCommand);
        expect(options.output).toBe(format);
      }
    });

    it('should parse verbose flag', () => {
      mockCommand.setOptionValue('verbose', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.verbose).toBe(true);
    });

    it('should auto-enable showResponse when statusOnly is set', () => {
      mockCommand.setOptionValue('statusOnly', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.statusOnly).toBe(true);
      expect(options.showResponse).toBe(true);
    });

    it('should not enable showResponse when neither flag is set', () => {
      const options = getGlobalOptions(mockCommand);
      expect(options.statusOnly).toBe(false);
      expect(options.showResponse).toBe(false);
    });

    it('parses --dry-run and defaults it to false', () => {
      const options = getGlobalOptions(mockCommand);
      expect(options.dryRun).toBe(false);
    });

    it('--dry-run implies --show-request when --curl is not set', () => {
      mockCommand.setOptionValue('dryRun', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.dryRun).toBe(true);
      expect(options.showRequest).toBe(true);
    });

    it('--dry-run does not force --show-request when --curl is explicitly set', () => {
      mockCommand.setOptionValue('dryRun', true);
      mockCommand.setOptionValue('curl', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.dryRun).toBe(true);
      expect(options.curl).toBe(true);
      expect(options.showRequest).toBe(false);
    });

    it('--show-request stays on with --dry-run and --curl both set', () => {
      mockCommand.setOptionValue('dryRun', true);
      mockCommand.setOptionValue('curl', true);
      mockCommand.setOptionValue('showRequest', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.showRequest).toBe(true);
      expect(options.curl).toBe(true);
    });

    it('parses show/exclude/show-only into arrays (defaulting show/exclude to [])', () => {
      const options = getGlobalOptions(mockCommand);
      expect(options.show).toEqual([]);
      expect(options.exclude).toEqual([]);
      expect(options.showOnly).toBeUndefined();

      mockCommand.setOptionValue('show', ['a', 'b']);
      mockCommand.setOptionValue('exclude', ['c']);
      const parsed = getGlobalOptions(mockCommand);
      expect(parsed.show).toEqual(['a', 'b']);
      expect(parsed.exclude).toEqual(['c']);
    });

    it('rejects --show-only combined with --show', () => {
      mockCommand.setOptionValue('showOnly', ['id']);
      mockCommand.setOptionValue('show', ['audience']);
      expect(() => getGlobalOptions(mockCommand)).toThrow(
        '--show-only is mutually exclusive with --show and --exclude'
      );
    });

    it('rejects --show-only combined with --exclude', () => {
      mockCommand.setOptionValue('showOnly', ['id']);
      mockCommand.setOptionValue('exclude', ['tags']);
      expect(() => getGlobalOptions(mockCommand)).toThrow(
        '--show-only is mutually exclusive with --show and --exclude'
      );
    });

    it('should handle --no-color flag', () => {
      mockCommand.parse(['node', 'test', '--no-color']);

      const options = getGlobalOptions(mockCommand);
      expect(options.noColor).toBe(true);
    });

    it('should parse terse and full flags', () => {
      mockCommand.setOptionValue('terse', true);
      mockCommand.setOptionValue('full', true);

      const options = getGlobalOptions(mockCommand);
      expect(options.terse).toBe(true);
      expect(options.full).toBe(true);
    });

    it('should parse profile option', () => {
      mockCommand.setOptionValue('profile', 'staging');

      const options = getGlobalOptions(mockCommand);
      expect(options.profile).toBe('staging');
    });

    it('should pass noColor correctly to formatOutput when --no-color is set', () => {
      mockCommand.parse(['node', 'test', '--no-color']);

      const globalOptions = getGlobalOptions(mockCommand);
      const testData = { name: 'test-experiment', status: 'running' };

      printFormatted(testData, globalOptions);

      expect(formatOutput).toHaveBeenCalledWith(
        testData,
        'table',
        expect.objectContaining({
          noColor: true,
          full: false,
          terse: false,
        })
      );
    });

    it('should auto-detect noColor from TTY when --no-color is not set', () => {
      mockCommand.parse(['node', 'test']);

      const globalOptions = getGlobalOptions(mockCommand);
      const testData = { name: 'test-experiment', status: 'running' };

      printFormatted(testData, globalOptions);

      expect(formatOutput).toHaveBeenCalledWith(
        testData,
        'table',
        expect.objectContaining({
          noColor: !process.stdout.isTTY,
          full: false,
          terse: false,
        })
      );
    });

    describe('outputExplicit', () => {
      it('is false when --output is not passed on the CLI', () => {
        // Mock command at line 192 registers --output with a default of 'table'.
        // Defaults must NOT count as "explicit" — that's the whole point.
        mockCommand.parse(['node', 'test']);

        const options = getGlobalOptions(mockCommand);
        expect(options.output).toBe('table');
        expect(options.outputExplicit).toBe(false);
      });

      it('is true when --output is passed on the CLI', () => {
        mockCommand.parse(['node', 'test', '--output', 'json']);

        const options = getGlobalOptions(mockCommand);
        expect(options.output).toBe('json');
        expect(options.outputExplicit).toBe(true);
      });

      it('is true even when the user explicitly chooses table', () => {
        // Regression: prior implementation could not distinguish "no flag"
        // from "explicit -o table", which broke piping into table format.
        mockCommand.parse(['node', 'test', '--output', 'table']);

        const options = getGlobalOptions(mockCommand);
        expect(options.output).toBe('table');
        expect(options.outputExplicit).toBe(true);
      });

      it('is detected on the leaf subcommand when --output is set as a global option', () => {
        const root = new Command();
        root.option('-o, --output <format>', 'output format');
        const sub = new Command('list');
        root.addCommand(sub);

        root.parse(['node', 'test', '--output', 'json', 'list']);

        const options = getGlobalOptions(sub);
        expect(options.output).toBe('json');
        expect(options.outputExplicit).toBe(true);
      });
    });
  });

  describe('printFormatted', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('applies global --exclude to the data before formatting', () => {
      printFormatted([{ id: 1, secret: 'x' }], { output: 'json', exclude: ['secret'] });
      expect(formatOutput).toHaveBeenLastCalledWith([{ id: 1 }], 'json', expect.anything());
    });

    it('applies global --show-only to the data before formatting', () => {
      printFormatted([{ id: 1, name: 'a', secret: 'x' }], {
        output: 'json',
        showOnly: ['name'],
      });
      expect(formatOutput).toHaveBeenLastCalledWith([{ name: 'a' }], 'json', expect.anything());
    });

    it('leaves data untouched when no projection flags are set', () => {
      const data = [{ id: 1, secret: 'x' }];
      printFormatted(data, { output: 'json' });
      expect(formatOutput).toHaveBeenLastCalledWith(data, 'json', expect.anything());
    });
  });

  describe('shouldOutputIdsOnly', () => {
    afterEach(() => {
      setTTYOverride({ stdin: true, stdout: true });
    });

    it('returns true when output is explicitly "ids"', () => {
      setTTYOverride({ stdout: true });
      expect(shouldOutputIdsOnly({ output: 'ids', outputExplicit: true })).toBe(true);
    });

    it('returns true when stdout is piped and no explicit --output was given', () => {
      setTTYOverride({ stdout: false });
      expect(shouldOutputIdsOnly({ output: 'table', outputExplicit: false })).toBe(true);
    });

    it('returns false when stdout is piped but the user explicitly chose --output json', () => {
      // Regression: this is the original bug — piped + -o json was forcing ids.
      setTTYOverride({ stdout: false });
      expect(shouldOutputIdsOnly({ output: 'json', outputExplicit: true })).toBe(false);
    });

    it('returns false when stdout is piped but the user explicitly chose --output table', () => {
      setTTYOverride({ stdout: false });
      expect(shouldOutputIdsOnly({ output: 'table', outputExplicit: true })).toBe(false);
    });

    it('returns false on a TTY when no explicit output was given', () => {
      setTTYOverride({ stdout: true });
      expect(shouldOutputIdsOnly({ output: 'table', outputExplicit: false })).toBe(false);
    });

    it('returns false on a TTY when explicit --output json was given', () => {
      setTTYOverride({ stdout: true });
      expect(shouldOutputIdsOnly({ output: 'json', outputExplicit: true })).toBe(false);
    });
  });

  describe('printResult', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setTTYOverride({ stdin: true, stdout: true });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      setTTYOverride({ stdin: true, stdout: true });
    });

    it('prints the chalk success message for table output (default)', () => {
      printResult(
        { output: 'table', outputExplicit: false, noColor: true },
        { message: '✓ Metric 42 updated', id: 42 }
      );

      expect(formatOutput).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledOnce();
      const printed = consoleSpy.mock.calls[0]?.[0] as string;
      expect(printed).toContain('✓ Metric 42 updated');
    });

    it('routes through printFormatted with {success,message,id} for json', () => {
      printResult(
        { output: 'json', outputExplicit: true, noColor: true },
        { message: '✓ Metric created with ID: 42', id: 42 }
      );

      expect(formatOutput).toHaveBeenCalledOnce();
      expect(formatOutput).toHaveBeenCalledWith(
        { success: true, message: '✓ Metric created with ID: 42', id: 42 },
        'json',
        expect.any(Object)
      );
    });

    it('omits id from the JSON payload when no id is provided', () => {
      printResult(
        { output: 'json', outputExplicit: true, noColor: true },
        { message: '✓ Datasource connection test passed' }
      );

      expect(formatOutput).toHaveBeenCalledWith(
        { success: true, message: '✓ Datasource connection test passed' },
        'json',
        expect.any(Object)
      );
    });

    it('emits the raw API response when --raw is set and raw is supplied', () => {
      const raw = { id: 42, name: 'foo', state: 'created' };
      printResult(
        { output: 'json', outputExplicit: true, noColor: true, raw: true },
        { message: '✓ Metric created', id: 42, raw }
      );

      expect(formatOutput).toHaveBeenCalledWith(raw, 'json', expect.any(Object));
    });

    it('falls back to the minimal payload when --raw is set but no raw is supplied', () => {
      printResult(
        { output: 'json', outputExplicit: true, noColor: true, raw: true },
        { message: '✓ Metric 42 updated', id: 42 }
      );

      expect(formatOutput).toHaveBeenCalledWith(
        { success: true, message: '✓ Metric 42 updated', id: 42 },
        'json',
        expect.any(Object)
      );
    });

    it('routes structured outputs (yaml, markdown, plain, vertical, template) through printFormatted', () => {
      for (const format of ['yaml', 'markdown', 'plain', 'vertical', 'template'] as const) {
        vi.mocked(formatOutput).mockClear();
        printResult(
          { output: format, outputExplicit: true, noColor: true },
          { message: '✓ X done', id: 1 }
        );
        expect(formatOutput).toHaveBeenCalledOnce();
      }
    });

    it('prints only the id when output is "ids" (and stays quiet on stderr)', () => {
      printResult(
        { output: 'ids', outputExplicit: true },
        { message: '✓ Metric 42 updated', id: 42 }
      );

      expect(formatOutput).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(42);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('prints id to stdout and the green confirmation to stderr when piped without explicit -o', () => {
      setTTYOverride({ stdout: false });
      printResult(
        { output: 'table', outputExplicit: false, noColor: true },
        { message: '✓ Metric created with ID: 42', id: 42 }
      );

      expect(consoleSpy).toHaveBeenCalledWith(42);
      const stderrMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(stderrMessage).toContain('✓ Metric created with ID: 42');
      expect(formatOutput).not.toHaveBeenCalled();
    });

    it('writes nothing on stdout but still confirms on stderr when piped without an id', () => {
      // No id available (e.g. connection test): stdout stays empty so a
      // downstream `xargs` doesn't choke, but the user still gets the
      // confirmation on stderr.
      setTTYOverride({ stdout: false });
      printResult(
        { output: 'table', outputExplicit: false, noColor: true },
        { message: '✓ Datasource connection test passed' }
      );

      expect(consoleSpy).not.toHaveBeenCalled();
      const stderrMessage = consoleErrorSpy.mock.calls[0]?.[0] as string;
      expect(stderrMessage).toContain('✓ Datasource connection test passed');
      expect(formatOutput).not.toHaveBeenCalled();
    });

    it('still emits JSON when piped if -o json was set explicitly', () => {
      setTTYOverride({ stdout: false });
      printResult(
        { output: 'json', outputExplicit: true, noColor: true },
        { message: '✓ Metric 42 updated', id: 42 }
      );

      expect(formatOutput).toHaveBeenCalledWith(
        { success: true, message: '✓ Metric 42 updated', id: 42 },
        'json',
        expect.any(Object)
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('withErrorHandling', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
        throw new Error(`process.exit: ${code}`);
      });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should catch async errors and call handleCommandError', async () => {
      const wrapped = withErrorHandling(async () => {
        throw new Error('test async error');
      });

      await expect(wrapped()).rejects.toThrow('process.exit: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'test async error');
    });

    it('should exit with code 1', async () => {
      const wrapped = withErrorHandling(async () => {
        throw new Error('fail');
      });

      await expect(wrapped()).rejects.toThrow('process.exit: 1');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error throws', async () => {
      const wrapped = withErrorHandling(async () => {
        throw 'string error';
      });

      await expect(wrapped()).rejects.toThrow('process.exit: 1');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'string error');
    });

    it('should not interfere with successful execution', async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const wrapped = withErrorHandling(fn);

      await wrapped();
      expect(fn).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('resolveAuth', () => {
    beforeEach(() => {
      (loadConfig as any).mockReturnValue({
        'default-profile': 'default',
        'analytics-opt-out': false,
        output: 'table',
        profiles: {
          default: {
            api: { endpoint: 'https://api.example.com/v1' },
            expctld: { endpoint: '' },
          },
        },
      });

      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.example.com/v1' },
        expctld: { endpoint: '' },
      });
    });

    it('returns api-key auth when --api-key flag is provided', async () => {
      const auth = await resolveAuth({ apiKey: 'flag-key' });
      expect(auth).toEqual({ method: 'api-key', apiKey: 'flag-key' });
    });

    it('returns api-key auth from env var', async () => {
      process.env.ABSMARTLY_API_KEY = 'env-key';
      const auth = await resolveAuth({});
      expect(auth).toEqual({ method: 'api-key', apiKey: 'env-key' });
    });

    it('returns api-key auth from keyring when auth-method is api-key', async () => {
      (getAPIKey as any).mockResolvedValue('keyring-api-key');
      const auth = await resolveAuth({});
      expect(auth).toEqual({ method: 'api-key', apiKey: 'keyring-api-key' });
    });

    it('returns oauth-jwt auth from keyring when auth-method is oauth-jwt', async () => {
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.example.com/v1', 'auth-method': 'oauth-jwt' },
        expctld: { endpoint: '' },
      });
      (getOAuthToken as any).mockResolvedValue('jwt-token-from-keyring');

      const auth = await resolveAuth({});
      expect(auth.method).toBe('oauth-jwt');
      if (auth.method === 'oauth-jwt') {
        expect(auth.token).toBe('jwt-token-from-keyring');
      }
    });

    it('--api-key flag overrides oauth-jwt auth-method in profile', async () => {
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.example.com/v1', 'auth-method': 'oauth-jwt' },
        expctld: { endpoint: '' },
      });

      const auth = await resolveAuth({ apiKey: 'override-key' });
      expect(auth).toEqual({ method: 'api-key', apiKey: 'override-key' });
    });

    it('throws when no api key found', async () => {
      (getAPIKey as any).mockResolvedValue(null);
      await expect(resolveAuth({})).rejects.toThrow('No API key found');
    });

    it('throws when no oauth token found', async () => {
      (getProfile as any).mockReturnValue({
        api: { endpoint: 'https://api.example.com/v1', 'auth-method': 'oauth-jwt' },
        expctld: { endpoint: '' },
      });
      (getOAuthToken as any).mockResolvedValue(null);
      await expect(resolveAuth({})).rejects.toThrow('No OAuth token found');
    });
  });
});
