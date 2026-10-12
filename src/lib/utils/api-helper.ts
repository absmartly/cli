import { createAPIClient, APIClient } from '../api/client.js';
import { getProfile, loadConfig } from '../config/config.js';
import { getAPIKey, getOAuthToken } from '../config/keyring.js';
import type { AuthConfig } from '../api/axios-adapter.js';
import { Command } from 'commander';
import chalk from 'chalk';
import { DryRunError } from '../../api-client/http-client.js';
import { formatOutput, type OutputFormat } from '../output/formatter.js';
import { projectFields } from '../output/project-fields.js';
import { isStdoutPiped } from './stdin.js';

export async function resolveAPIKey(options: GlobalOptions): Promise<string> {
  const config = loadConfig();
  const profileName = options.profile || config['default-profile'];
  const apiKey = options.apiKey || process.env.ABSMARTLY_API_KEY || (await getAPIKey(profileName));

  if (!apiKey) {
    throw new Error(
      `No API key found for profile "${profileName}".\n` +
        `Run: abs setup\n` +
        `Or:  abs --endpoint https://your-api.example.com/v1 --api-key YOUR_KEY <command>`
    );
  }

  return apiKey;
}

export function resolveEndpoint(options: GlobalOptions): string {
  const config = loadConfig();
  const profileName = options.profile || config['default-profile'];
  const profile = getProfile(profileName);
  return options.endpoint || process.env.ABSMARTLY_API_ENDPOINT || profile.api.endpoint;
}

export async function resolveAuth(options: GlobalOptions): Promise<AuthConfig> {
  if (options.apiKey) {
    return { method: 'api-key', apiKey: options.apiKey };
  }

  const envKey = process.env.ABSMARTLY_API_KEY;
  if (envKey) {
    return { method: 'api-key', apiKey: envKey };
  }

  const config = loadConfig();
  const profileName = options.profile || config['default-profile'];
  const profile = getProfile(profileName);
  const authMethod = profile.api['auth-method'] ?? 'api-key';

  if (authMethod === 'oauth-jwt') {
    const token = await getOAuthToken(profileName);
    if (!token) {
      throw new Error(
        `No OAuth token found for profile "${profileName}".\n` + `Run: abs auth login`
      );
    }
    return { method: 'oauth-jwt', token };
  }

  const apiKey = await getAPIKey(profileName);
  if (!apiKey) {
    throw new Error(
      `No API key found for profile "${profileName}".\n` +
        `Run: abs auth login\n` +
        `Or:  abs --endpoint https://your-api.example.com/v1 --api-key YOUR_KEY <command>`
    );
  }
  return { method: 'api-key', apiKey };
}

export async function getAPIClientFromOptions(options: GlobalOptions): Promise<APIClient> {
  const config = loadConfig();
  const profileName = options.profile || config['default-profile'];
  const profile = getProfile(profileName);
  const endpoint = options.endpoint || process.env.ABSMARTLY_API_ENDPOINT || profile.api.endpoint;

  if (!endpoint) {
    throw new Error(
      `No API endpoint configured for profile "${profileName}".\n` +
        `Run: abs auth login\n` +
        `Or:  abs --endpoint https://your-api.example.com/v1 --api-key YOUR_KEY <command>`
    );
  }

  const auth = await resolveAuth(options);
  return createAPIClient(endpoint, auth, {
    verbose: options.verbose ?? false,
    insecure: profile.api.insecure ?? false,
    dryRun: options.dryRun ?? false,
    showRequest: options.showRequest ?? false,
    showResponse: options.showResponse ?? false,
    curl: options.curl ?? false,
    showSecrets: options.showSecrets ?? false,
    headersOnly: options.headersOnly ?? false,
    statusOnly: options.statusOnly ?? false,
    // Pass user-intent only (--no-color or NO_COLOR), not the stdout-TTY
    // conflated value: stderr diagnostics make their own TTY decision.
    noColor: options.colorDisabled ?? false,
  });
}

export interface GlobalOptions {
  config?: string;
  apiKey?: string;
  endpoint?: string;
  app?: string;
  env?: string;
  output?: OutputFormat;
  // True when the user explicitly set --output (via CLI or env), false when
  // the value was defaulted. Used to decide whether to auto-switch to ids
  // mode when stdout is piped.
  outputExplicit?: boolean;
  noColor?: boolean;
  // True when the user explicitly disabled color (--no-color or NO_COLOR env).
  // noColor above additionally disables when stdout isn't a TTY; this field
  // is the strict user-intent variant for stderr-bound consumers.
  colorDisabled?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  profile?: string;
  terse?: boolean;
  full?: boolean;
  raw?: boolean;
  // Column-projection flags, global across all commands. `show` adds extra
  // fields where a summarized view exists (no-op otherwise); `exclude` hides
  // fields; `showOnly` keeps only the listed fields. showOnly is mutually
  // exclusive with show/exclude (validated in getGlobalOptions).
  show?: string[] | undefined;
  exclude?: string[] | undefined;
  showOnly?: string[] | undefined;
  dryRun?: boolean;
  showRequest?: boolean;
  showResponse?: boolean;
  curl?: boolean;
  showSecrets?: boolean;
  headersOnly?: boolean;
  statusOnly?: boolean;
}

const VALID_FORMATS: OutputFormat[] = [
  'table',
  'json',
  'yaml',
  'plain',
  'markdown',
  'rendered',
  'template',
  'vertical',
  'ids',
];

export function getGlobalOptions(cmd: Command): GlobalOptions {
  const opts = cmd.optsWithGlobals();
  const output = (opts.output || 'table') as OutputFormat;
  const outputSource = cmd.getOptionValueSourceWithGlobals('output');
  const outputExplicit = outputSource === 'cli' || outputSource === 'env';

  if (!VALID_FORMATS.includes(output)) {
    throw new Error(
      `Invalid output format: '${output}'. Must be one of: ${VALID_FORMATS.join(', ')}`
    );
  }

  const colorDisabled = opts.color === false || !!process.env.NO_COLOR;
  // --status-only is response-only by definition; auto-enable --show-response
  // so the user doesn't have to type both.
  const statusOnly = opts.statusOnly || false;
  const showResponse = opts.showResponse || statusOnly || false;
  // --dry-run implies --show-request (so the payload is still shown) unless the
  // user asked for curl output instead.
  const dryRun = opts.dryRun || false;
  const curl = opts.curl || false;
  const showRequest = opts.showRequest || (dryRun && !curl) || false;

  const show = (opts.show as string[] | undefined) ?? [];
  const exclude = (opts.exclude as string[] | undefined) ?? [];
  const showOnly = opts.showOnly as string[] | undefined;
  if (showOnly && (show.length > 0 || exclude.length > 0)) {
    throw new Error('--show-only is mutually exclusive with --show and --exclude');
  }

  return {
    config: opts.config,
    apiKey: opts.apiKey,
    endpoint: opts.endpoint,
    app: opts.app,
    env: opts.env,
    output,
    outputExplicit,
    noColor: colorDisabled || !process.stdout.isTTY,
    colorDisabled,
    verbose: opts.verbose || false,
    quiet: opts.quiet || false,
    profile: opts.profile,
    terse: opts.terse || false,
    full: opts.full || false,
    raw: opts.raw || false,
    show,
    exclude,
    showOnly,
    dryRun,
    showRequest,
    showResponse,
    curl,
    showSecrets: opts.showSecrets || false,
    headersOnly: opts.headersOnly || false,
    statusOnly,
  };
}

// When stdout is piped to another process, list commands fall back to
// emitting ids only — unless the user explicitly chose an output format.
// Centralizes the rule so every list-style command behaves the same way.
export function shouldOutputIdsOnly(globalOptions: GlobalOptions): boolean {
  return globalOptions.output === 'ids' || (isStdoutPiped() && !globalOptions.outputExplicit);
}

// Appends a one-line reminder to a read command's `--help` that the global
// field-projection flags are available. They live on the root program (so they
// don't appear under each subcommand's Options), and this keeps them
// discoverable where they're useful. Returns the command for chaining.
export function addFieldProjectionHelp(cmd: Command): Command {
  return cmd.addHelpText(
    'after',
    '\nField selection (global): --show <fields...>, --exclude <fields...>, --show-only <fields...>\nSee `abs --help` for details.'
  );
}

export function printFormatted(data: unknown, globalOptions: GlobalOptions): void {
  // Apply the global --exclude / --show-only key projection. This is idempotent
  // for commands that already projected at the summary layer and is the only
  // place projection happens for commands without a summarized view.
  const projected = projectFields(data, {
    exclude: globalOptions.exclude,
    showOnly: globalOptions.showOnly,
  });
  const output = formatOutput(projected, globalOptions.output, {
    noColor: globalOptions.noColor ?? false,
    full: globalOptions.full ?? false,
    terse: globalOptions.terse ?? false,
  });
  console.log(output);
}

// Formats that should render structured machine output instead of the
// human-readable green checkmark. `table` and `rendered` keep the
// interactive success message; everything machine-oriented (json, yaml,
// markdown, plain, vertical, template) goes through printFormatted.
const STRUCTURED_FORMATS: ReadonlySet<OutputFormat> = new Set([
  'json',
  'yaml',
  'markdown',
  'plain',
  'vertical',
  'template',
]);

// Print the outcome of a mutation (create/update/delete/archive/etc).
// Honors --output and the same pipe-falls-back-to-ids rule the list
// commands use, so a single helper covers every command type.
//
// Behavior by mode:
//   - structured --output (json/yaml/markdown/plain/vertical/template):
//       emits the structured payload to stdout. With --raw + a provided
//       raw response, that response is used verbatim; otherwise the
//       minimal { success, message, id? } is rendered.
//   - explicit --output ids: bare id to stdout (or silent if no id).
//   - stdout piped without explicit --output: bare id to stdout for
//       chaining, the green confirmation message to stderr so the user
//       still sees what happened.
//   - interactive default: chalk.green(message) to stdout.
export function printResult(
  globalOptions: GlobalOptions,
  args: { message: string; id?: unknown; raw?: unknown }
): void {
  const format = (globalOptions.output ?? 'table') as OutputFormat;

  if (globalOptions.outputExplicit && STRUCTURED_FORMATS.has(format)) {
    const payload =
      globalOptions.raw && args.raw !== undefined
        ? args.raw
        : {
            success: true,
            message: args.message,
            ...(args.id !== undefined ? { id: args.id } : {}),
          };
    printFormatted(payload, globalOptions);
    return;
  }

  if (shouldOutputIdsOnly(globalOptions)) {
    if (args.id !== undefined) console.log(args.id);
    // Piped (no explicit format) → also surface the confirmation on
    // stderr so users running `cmd | xargs ...` still see success.
    // Explicit `-o ids` stays quiet to keep the stream machine-clean.
    if (isStdoutPiped() && !globalOptions.outputExplicit) {
      console.error(chalk.green(args.message));
    }
    return;
  }

  console.log(chalk.green(args.message));
}

function handleCommandError(error: unknown): never {
  console.error('Error:', error instanceof Error ? error.message : error);
  const apiError = error as { statusCode?: number; response?: unknown };
  if (apiError.response && typeof apiError.response === 'object') {
    const resp = apiError.response as Record<string, unknown>;
    if (resp.errors && Array.isArray(resp.errors) && resp.errors.length > 0) {
      for (const e of resp.errors) console.error(' ', e);
    }
  }
  process.exit(1);
}

export function withErrorHandling<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (error) {
      if (error instanceof DryRunError) {
        console.log(chalk.blue(error.message));
        return;
      }
      handleCommandError(error);
    }
  };
}
