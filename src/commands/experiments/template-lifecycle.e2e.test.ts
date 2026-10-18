import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createAPIClient } from '../../lib/api/client.js';
import { deleteOAuthToken, setOAuthToken } from '../../lib/config/keyring.js';
import { ExperimentId } from '../../api-client/types.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../../test/helpers/test-config.js';

// Drives the real `abs` binary against a live API: generate a template, edit it
// the way a user would, create from it, then run the lifecycle. Point
// ABS_E2E_CLI at another build (e.g. a published release's bin) to compare.
const CLI = (process.env.ABS_E2E_CLI ?? 'bun src/index.ts').split(' ');
const TIMEOUT = 120_000;

const client = createAPIClient(TEST_BASE_URL, TEST_API_KEY);
const createdIds: ExperimentId[] = [];
let workDir: string;

function abs(...args: string[]): { stdout: string; stderr: string; status: number | null } {
  const [cmd, ...cmdArgs] = CLI;
  const liveProfile = process.env.LIVE_PROFILE;
  const cliArgs = liveProfile
    ? [...cmdArgs, '--profile', liveProfile, ...args]
    : [...cmdArgs, ...args];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: '1',
  };
  if (typeof TEST_API_KEY === 'string') {
    env.ABSMARTLY_API_KEY = TEST_API_KEY;
    env.ABSMARTLY_API_ENDPOINT = TEST_BASE_URL;
  } else {
    // OAuth live profiles are resolved by the child CLI from the same profile
    // and keyring token as the test runner; do not coerce AuthConfig to a key.
    delete env.ABSMARTLY_API_KEY;
    delete env.ABSMARTLY_API_ENDPOINT;
  }
  const result = spawnSync(cmd!, cliArgs, {
    encoding: 'utf8',
    env,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

function absOk(...args: string[]): string {
  const result = abs(...args);
  if (result.status !== 0) {
    throw new Error(`abs ${args.join(' ')} exited ${result.status}\n${result.stderr}`);
  }
  return result.stdout;
}

// generate-template emits placeholder metric names and no owner; replace them
// with real values so the template resolves against the live instance.
function editTemplate(template: string, guardrail: string, ownerEmail: string): string {
  const edited = template
    .replace('state: created', 'state: ready')
    .replace(/secondary_metrics:\n(?: {2}- .*\n)+/, '')
    .replace(/guardrail_metrics:\n(?: {2}- .*\n)+/, `guardrail_metrics:\n  - ${guardrail}\n`)
    .replace('## Variants', `owners:\n  - ${ownerEmail}\n\n## Variants`);
  expect(edited).toContain(`  - ${guardrail}`);
  expect(edited).toContain(`  - ${ownerEmail}`);
  return edited;
}

async function createFromTemplate(type: 'feature' | 'test', name: string): Promise<ExperimentId> {
  const template = absOk('experiments', 'generate-template', '--type', type, '--name', name);
  const file = join(workDir, `${name}.md`);
  writeFileSync(file, editTemplate(template, guardrailName, ownerEmail));

  // Template warnings are printed to stdout ahead of the JSON body.
  const stdout = absOk('experiments', 'create', '--from-file', file, '-o', 'json');
  const created = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { id: number };
  expect(created.id).toBeGreaterThan(0);
  const id = ExperimentId(created.id);
  createdIds.push(id);
  return id;
}

let guardrailName: string;
let ownerEmail: string;

describe.runIf(isLiveMode)('experiments created from a generated template (live)', () => {
  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'abs-template-e2e-'));
    const [metrics, user] = await Promise.all([
      client.listMetrics({ items: 50 }),
      client.getCurrentUser(),
    ]);
    const metric = metrics.find((m) => !m.archived);
    if (!metric) throw new Error('No unarchived metric on the live instance');
    guardrailName = metric.name;
    ownerEmail = user.email;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        const experiment = await client.getExperiment(id);
        if (experiment.state === 'running' || experiment.state === 'development') {
          await client.stopExperiment(id, 'other', 'template e2e cleanup');
        }
        if (!experiment.archived) await client.archiveExperiment(id);
        const after = await client.getExperiment(id);
        if (!after.archived) console.error(`template e2e: experiment ${id} not archived`);
      } catch (error) {
        console.error(`template e2e: cleanup of experiment ${id} failed: ${error}`);
      }
    }
    rmSync(workDir, { recursive: true, force: true });
  }, TIMEOUT);

  it(
    'creates a feature flag, then starts, stops and archives it',
    async () => {
      const id = await createFromTemplate('feature', `vitest_template_flag_${Date.now()}`);

      const flag = await client.getExperiment(id);
      expect(flag.type).toBe('feature');
      expect(flag.state).toBe('ready');
      expect(flag.primary_metric_id ?? null).toBeNull();
      const metrics = (flag.secondary_metrics ?? []) as Array<{ type: string }>;
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.every((m) => m.type === 'guardrail')).toBe(true);

      // For a feature flag, start turns it on and stop turns it off; the flag
      // stays in the running state until it is archived.
      absOk('experiments', 'start', String(id));
      const started = await client.getExperiment(id);
      expect(started.state).toBe('running');
      expect(started.feature_state).toBe('on');

      absOk('experiments', 'stop', String(id));
      expect((await client.getExperiment(id)).feature_state).toBe('off');

      absOk('experiments', 'archive', String(id));
      const archived = await client.getExperiment(id);
      expect(archived.state).toBe('stopped');
      expect(archived.archived).toBe(true);
    },
    TIMEOUT
  );

  it(
    'creates an experiment, then archives it',
    async () => {
      const id = await createFromTemplate('test', `vitest_template_test_${Date.now()}`);

      const experiment = await client.getExperiment(id);
      expect(experiment.type).toBe('test');
      expect(experiment.state).toBe('ready');
      expect(experiment.percentage_of_traffic).toBe(100);

      absOk('experiments', 'archive', String(id));
      expect((await client.getExperiment(id)).archived).toBe(true);
    },
    TIMEOUT
  );
});
