import { describe, it, expect, beforeAll } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExperimentPayload } from './builder.js';
import type { ExperimentTemplate } from '../template/parser.js';
import type { ResolverContext } from './resolver.js';
import { loadOpenAPISpec, validateRequestStrict } from 'absmartly-api-mocks/validation';

const validationEntry = fileURLToPath(import.meta.resolve('absmartly-api-mocks/validation'));
const mocksDir = resolve(dirname(validationEntry), '..', '..');
const specPath = resolve(mocksDir, 'openapi/openapi.bundle.yaml');

const baseContext: ResolverContext = {
  applications: [{ id: 1, name: 'web' }],
  unitTypes: [{ id: 1, name: 'user_id' }],
  metrics: [
    { id: 1, name: 'clicks' },
    { id: 2, name: 'revenue' },
  ],
  goals: [{ id: 1, name: 'purchase' }],
};

describe('buildExperimentPayload', () => {
  it('should build minimal payload with defaults', async () => {
    const template: ExperimentTemplate = { name: 'my_exp' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.name).toBe('my_exp');
    expect(payload.display_name).toBe('my_exp');
    expect(payload.type).toBe('test');
    expect(payload.state).toBe('ready');
    expect(payload.percentage_of_traffic).toBe(100);
    expect(payload.percentages).toBe('50/50');
    expect(payload.analysis_type).toBe('group_sequential');
    expect(payload.nr_variants).toBe(2);
    const variants = payload.variants as Array<Record<string, unknown>>;
    expect(variants[0].name).toBe('control');
    expect(variants[1].name).toBe('treatment');
  });

  it('should resolve application by name', async () => {
    const template: ExperimentTemplate = { name: 'exp', application: 'web' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.applications).toEqual([{ application_id: 1, application_version: '0' }]);
  });

  it('should resolve unit_type by name', async () => {
    const template: ExperimentTemplate = { name: 'exp', unit_type: 'user_id' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.unit_type).toEqual({ unit_type_id: 1 });
  });

  it('should resolve primary and secondary metrics', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      primary_metric: 'clicks',
      secondary_metrics: ['revenue'],
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.primary_metric).toEqual({ metric_id: 1 });
    expect(payload.secondary_metrics).toEqual([
      { metric_id: 2, type: 'secondary', order_index: 0 },
    ]);
  });

  it('should merge guardrail metrics into secondary_metrics with type guardrail', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      secondary_metrics: ['clicks'],
      guardrail_metrics: ['revenue'],
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.secondary_metrics).toEqual([
      { metric_id: 1, type: 'secondary', order_index: 0 },
      { metric_id: 2, type: 'guardrail', order_index: 1 },
    ]);
  });

  it('should merge all metric types into secondary_metrics', async () => {
    const context: ResolverContext = {
      ...baseContext,
      metrics: [
        { id: 1, name: 'clicks' },
        { id: 2, name: 'revenue' },
        { id: 3, name: 'latency' },
      ],
    };
    const template: ExperimentTemplate = {
      name: 'exp',
      secondary_metrics: ['clicks'],
      guardrail_metrics: ['revenue'],
      exploratory_metrics: ['latency'],
    };
    const { payload } = await buildExperimentPayload(template, context);
    expect(payload.secondary_metrics).toEqual([
      { metric_id: 1, type: 'secondary', order_index: 0 },
      { metric_id: 2, type: 'guardrail', order_index: 1 },
      { metric_id: 3, type: 'exploratory', order_index: 2 },
    ]);
  });

  it('should apply custom_fields overrides to custom section field values', async () => {
    const context: ResolverContext = {
      ...baseContext,
      customSectionFields: [
        {
          id: 10,
          name: 'launch_date',
          type: 'string',
          default_value: '2026-01-01',
          custom_section: { type: 'test' },
        },
        {
          id: 11,
          name: 'hypothesis',
          type: 'text',
          default_value: '',
          custom_section: { type: 'test' },
        },
      ],
    };
    const template: ExperimentTemplate = {
      name: 'exp',
      custom_fields: { hypothesis: 'Users will click more' },
    };
    const { payload } = await buildExperimentPayload(template, context);
    const fields = payload.custom_section_field_values as Record<
      string,
      { type: string; value: string }
    >;
    expect(fields['10']).toEqual({ type: 'string', value: '2026-01-01' });
    expect(fields['11']).toEqual({ type: 'text', value: 'Users will click more' });
  });

  it('should build custom variants', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      variants: [
        { name: 'control', variant: 0, config: '{"a":1}' },
        { name: 'treatment', variant: 1, config: '{"a":2}' },
      ],
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    const variants = payload.variants as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe('control');
    expect(variants[0].config).toBe('{"a":1}');
  });

  it('should throw on invalid variant config JSON', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      variants: [{ name: 'v0', config: 'not-json' }],
    };
    await expect(buildExperimentPayload(template, baseContext)).rejects.toThrow(
      /Invalid JSON in variant/
    );
  });

  it('should include owner', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      owner_id: 42,
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.owners).toEqual([{ user_id: 42 }]);
  });

  describe('owner and user custom field resolution', () => {
    const users = [
      { id: 1, email: 'ann@example.com', first_name: 'Ann', last_name: 'Lee' },
      { id: 2, email: 'bob@example.com', first_name: 'Ann', last_name: 'Lee' },
      { id: 3, email: 'ANN.lee@example.com', first_name: 'Cy', last_name: 'Ho' },
    ];

    it('resolves owners by email, by "Name <email>" and by name, case-insensitively', async () => {
      const { payload, warnings } = await buildExperimentPayload(
        { name: 'exp', owners: ['BOB@example.com', 'X <ann.lee@EXAMPLE.com>', '7'] },
        { ...baseContext, users }
      );
      expect(payload.owners).toEqual([{ user_id: 2 }, { user_id: 3 }, { user_id: 7 }]);
      expect(warnings).toEqual([]);
    });

    it('warns with matches in input order when a name is ambiguous', async () => {
      const { payload, warnings } = await buildExperimentPayload(
        { name: 'exp', owners: ['ann lee', 'nobody'] },
        { ...baseContext, users }
      );
      expect(payload.owners).toBeUndefined();
      expect(warnings).toContain(
        'Owner "ann lee" matches multiple users: ann@example.com (id: 1), bob@example.com (id: 2). Use email to disambiguate.'
      );
      expect(warnings).toContain('Owner "nobody" not found, skipping');
    });

    const reviewerField = [
      { id: 9, title: 'Reviewers', type: 'user', custom_section: { type: 'test' } },
    ];
    const reviewers = async (value: string, ctxUsers = users) => {
      const { payload } = await buildExperimentPayload(
        { name: 'exp', custom_fields: { Reviewers: value } },
        { ...baseContext, users: ctxUsers, customSectionFields: reviewerField }
      );
      const values = payload.custom_section_field_values as Record<string, { value: string }>;
      return JSON.parse(values['9']!.value);
    };

    it('resolves user custom fields by email case-insensitively, first match wins', async () => {
      const dupes = [...users, { id: 4, email: 'ANN@example.com' }];
      expect(
        await reviewers(' Ann@Example.com ,user:7, nobody@x.com,BOB@example.com', dupes)
      ).toEqual({
        selected: [{ userId: 1 }, { userId: 7 }, { userId: 2 }],
      });
    });

    it('lowercases each reference once for special-casing characters', async () => {
      const manyUsers = Array.from({ length: 1_000 }, (_, i) => ({
        id: i,
        email: `u${i}@example.com`,
      }));
      for (const ch of ['\u0130', '\u03A3']) {
        const refs = Array.from({ length: 50 }, (_, i) => ch.repeat(5_000) + i);
        const start = performance.now();
        await buildExperimentPayload(
          { name: 'exp', owners: refs },
          { ...baseContext, users: manyUsers }
        );
        expect(await reviewers(refs.join(','), manyUsers)).toEqual({ selected: [] });
        expect(performance.now() - start).toBeLessThan(100);
      }
      // Matching still lowercases with full Unicode case mapping.
      expect(
        await reviewers('\u0130\u03A3@EXAMPLE.COM', [{ id: 5, email: 'i\u0307\u03C2@example.com' }])
      ).toEqual({ selected: [{ userId: 5 }] });
    });

    it('resolves many owners against many users in linear time', async () => {
      const manyUsers = Array.from({ length: 20_000 }, (_, i) => ({
        id: i,
        email: `u${i}@example.com`,
        first_name: 'U',
        last_name: String(i),
      }));
      const owners = manyUsers.map((u) => u.email);
      const start = performance.now();
      const { payload } = await buildExperimentPayload(
        { name: 'exp', owners },
        { ...baseContext, users: manyUsers }
      );
      expect(performance.now() - start).toBeLessThan(500);
      expect((payload.owners as unknown[]).length).toBe(20_000);
    });
  });

  it('numbers screenshots by position when variants have no explicit number', async () => {
    const variants = Array.from({ length: 3 }, (_, i) => ({
      name: `v${i}`,
      screenshot_id: 10 + i,
    }));
    const { payload } = await buildExperimentPayload({ name: 'exp', variants }, baseContext);
    expect(payload.variant_screenshots).toEqual([
      { variant: 0, screenshot_file_upload_id: 10 },
      { variant: 1, screenshot_file_upload_id: 11 },
      { variant: 2, screenshot_file_upload_id: 12 },
    ]);
  });

  it('should include group_sequential fields only when analysis_type is group_sequential', async () => {
    const template: ExperimentTemplate = { name: 'exp', analysis_type: 'group_sequential' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.group_sequential_futility_type).toBe('binding');
    expect(payload.group_sequential_min_analysis_interval).toBe('1d');
    expect(payload.group_sequential_first_analysis_interval).toBe('7d');
    expect(payload.group_sequential_max_duration_interval).toBe('6w');
  });

  it('should not include group_sequential fields when analysis_type is fixed_horizon', async () => {
    const template: ExperimentTemplate = { name: 'exp', analysis_type: 'fixed_horizon' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.group_sequential_futility_type).toBeUndefined();
    expect(payload.group_sequential_min_analysis_interval).toBeUndefined();
    expect(payload.group_sequential_first_analysis_interval).toBeUndefined();
    expect(payload.group_sequential_max_duration_interval).toBeUndefined();
  });

  it('should allow overriding group_sequential fields from template', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      analysis_type: 'group_sequential',
      group_sequential_futility_type: 'non_binding',
      group_sequential_min_analysis_interval: '2d',
      group_sequential_first_analysis_interval: '14d',
      group_sequential_max_duration_interval: '12w',
      group_sequential_analysis_count: '5',
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.group_sequential_futility_type).toBe('non_binding');
    expect(payload.group_sequential_min_analysis_interval).toBe('2d');
    expect(payload.group_sequential_first_analysis_interval).toBe('14d');
    expect(payload.group_sequential_max_duration_interval).toBe('12w');
    expect(payload.group_sequential_analysis_count).toBe('5');
  });

  it('should include minimum_detectable_effect when set', async () => {
    const template: ExperimentTemplate = { name: 'exp', minimum_detectable_effect: '5.0' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.minimum_detectable_effect).toBe('5.0');
  });

  it('should include baseline metric stats when set', async () => {
    const template: ExperimentTemplate = {
      name: 'exp',
      baseline_primary_metric_mean: '42.5',
      baseline_primary_metric_stdev: '10.2',
    };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.baseline_primary_metric_mean).toBe('42.5');
    expect(payload.baseline_primary_metric_stdev).toBe('10.2');
  });

  it('should not include optional stats fields when not set', async () => {
    const template: ExperimentTemplate = { name: 'exp' };
    const { payload } = await buildExperimentPayload(template, baseContext);
    expect(payload.minimum_detectable_effect).toBeUndefined();
    expect(payload.baseline_primary_metric_mean).toBeUndefined();
    expect(payload.baseline_primary_metric_stdev).toBeUndefined();
  });

  describe('variant screenshots', () => {
    it('should include inline file_upload for base64 screenshot', async () => {
      const base64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
      const template: ExperimentTemplate = {
        name: 'screenshot-exp',
        variants: [
          {
            name: 'control',
            variant: 0,
            config: '{}',
            screenshot: `data:image/png;base64,${base64}`,
          },
          { name: 'treatment', variant: 1, config: '{}' },
        ],
      };

      const { payload } = await buildExperimentPayload(template, baseContext);
      const screenshots = payload.variant_screenshots as Array<Record<string, unknown>>;

      expect(screenshots).toHaveLength(1);
      expect(screenshots[0].variant).toBe(0);
      const fileUpload = screenshots[0].file_upload as Record<string, unknown>;
      expect(fileUpload.data).toBe(base64);
      expect(fileUpload.content_type).toBe('image/png');
      expect(fileUpload.file_name).toBe('control.png');
    });

    it('should skip variants without screenshots', async () => {
      const template: ExperimentTemplate = {
        name: 'no-screenshot-exp',
        variants: [
          { name: 'control', variant: 0, config: '{}' },
          { name: 'treatment', variant: 1, config: '{}' },
        ],
      };

      const { payload } = await buildExperimentPayload(template, baseContext);
      expect(payload.variant_screenshots).toEqual([]);
    });
  });

  it('should build custom section field values', async () => {
    const context: ResolverContext = {
      ...baseContext,
      customSectionFields: [
        {
          id: 10,
          name: 'launch_date',
          type: 'string',
          default_value: '2026-01-01',
          custom_section: { type: 'test' },
        },
        { id: 11, name: 'owner', type: 'user', custom_section: { type: 'test' } },
        {
          id: 12,
          name: 'archived_field',
          type: 'string',
          archived: true,
          custom_section: { type: 'test' },
        },
      ],
    };
    const template: ExperimentTemplate = { name: 'exp', owner_id: 5 };
    const { payload } = await buildExperimentPayload(template, context);
    const fields = payload.custom_section_field_values as Record<
      string,
      { type: string; value: string }
    >;
    expect(fields['10']).toEqual({ type: 'string', value: '2026-01-01' });
    expect(fields['11']).toEqual({ type: 'user', value: '{"selected":[{"userId":5}]}' });
    expect(fields['12']).toBeUndefined();
  });

  describe('warnings', () => {
    it('should warn on unknown template fields', async () => {
      const template = {
        name: 'exp',
        hypothesis: 'Users will click more',
        description: 'A test',
        made_up_field: 'whatever',
      } as ExperimentTemplate;
      const { warnings } = await buildExperimentPayload(template, baseContext);
      expect(warnings).toContainEqual('Unknown template field "hypothesis" will be ignored');
      expect(warnings).toContainEqual('Unknown template field "description" will be ignored');
      expect(warnings).toContainEqual('Unknown template field "made_up_field" will be ignored');
    });

    it('should warn on unmatched custom fields', async () => {
      const context: ResolverContext = {
        ...baseContext,
        customSectionFields: [
          {
            id: 10,
            name: 'launch_date',
            type: 'string',
            default_value: '2026-01-01',
            custom_section: { type: 'test' },
          },
        ],
      };
      const template: ExperimentTemplate = {
        name: 'exp',
        custom_fields: { nonexistent_field: 'value', launch_date: '2026-06-01' },
      };
      const { warnings } = await buildExperimentPayload(template, context);
      expect(warnings).toContainEqual(
        'Custom field "nonexistent_field" in template has no matching custom section field'
      );
      expect(warnings).not.toContainEqual(expect.stringContaining('launch_date'));
    });

    it('should warn on unmatched custom fields when no context fields exist', async () => {
      const template: ExperimentTemplate = {
        name: 'exp',
        custom_fields: { hypothesis: 'test' },
      };
      const { warnings } = await buildExperimentPayload(template, baseContext);
      expect(warnings).toContainEqual(
        'Custom field "hypothesis" in template has no matching custom section field'
      );
    });

    it('should return no warnings for valid templates', async () => {
      const template: ExperimentTemplate = { name: 'exp', application: 'web' };
      const { warnings } = await buildExperimentPayload(template, baseContext);
      expect(warnings).toHaveLength(0);
    });
  });

  describe('OpenAPI schema compliance', () => {
    beforeAll(async () => {
      await loadOpenAPISpec(specPath);
    });

    async function expectValidPayload(payload: Record<string, unknown>) {
      const result = await validateRequestStrict('/experiments', 'post', payload);
      if (!result.valid) {
        const errors = result.errors
          .map((e) => `${e.path || '/'}: [${e.keyword}] ${e.message}`)
          .join('\n');
        expect.fail(`Payload failed OpenAPI schema validation:\n${errors}`);
      }
    }

    it('minimal payload should only contain spec-defined properties', async () => {
      const template: ExperimentTemplate = { name: 'my_exp' };
      const { payload } = await buildExperimentPayload(template, baseContext);
      await expectValidPayload(payload);
    });

    it('full payload with all fields should only contain spec-defined properties', async () => {
      const template: ExperimentTemplate = {
        name: 'full_exp',
        display_name: 'Full Experiment',
        type: 'test',
        state: 'ready',
        percentage_of_traffic: 80,
        percentages: '40/60',
        analysis_type: 'group_sequential',
        application: 'web',
        unit_type: 'user_id',
        primary_metric: 'clicks',
        secondary_metrics: ['revenue'],
        guardrail_metrics: ['clicks'],
        exploratory_metrics: ['revenue'],
        owner_id: 42,
        variants: [
          { name: 'control', variant: 0, config: '{"a":1}' },
          { name: 'treatment', variant: 1, config: '{"a":2}' },
        ],
      };
      const { payload } = await buildExperimentPayload(template, baseContext);
      await expectValidPayload(payload);
    });

    it('payload with custom section fields should only contain spec-defined properties', async () => {
      const context: ResolverContext = {
        ...baseContext,
        customSectionFields: [
          {
            id: 10,
            name: 'launch_date',
            type: 'string',
            default_value: '2026-01-01',
            custom_section: { type: 'test' },
          },
        ],
      };
      const template: ExperimentTemplate = { name: 'exp', owner_id: 5 };
      const { payload } = await buildExperimentPayload(template, context);
      await expectValidPayload(payload);
    });
  });
});
