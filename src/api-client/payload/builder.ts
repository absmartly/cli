import type { ExperimentTemplate, VariantTemplate } from '../template/parser.js';
import { extractAngleBracketed } from '../../lib/utils/linear-match.js';
import { createNameResolver, resolveByName, type ResolverContext } from './resolver.js';
import { buildSecondaryMetrics } from './metrics-builder.js';
import { resolveScreenshot } from '../template/screenshot.js';
import {
  DEFAULT_ANALYSIS_TYPE,
  DEFAULT_PERCENTAGES,
  DEFAULT_STATE,
  DEFAULT_TRAFFIC,
  DEFAULT_REQUIRED_ALPHA,
  DEFAULT_REQUIRED_POWER,
  DEFAULT_FUTILITY_TYPE,
  DEFAULT_MIN_ANALYSIS_INTERVAL,
  DEFAULT_FIRST_ANALYSIS_INTERVAL,
  DEFAULT_MAX_DURATION_INTERVAL,
  DEFAULT_BASELINE_PARTICIPANTS,
  DEFAULT_AUDIENCE,
  DEFAULT_CONTROL_NAME,
  DEFAULT_TREATMENT_NAME,
} from './defaults.js';

const CONFIG_PREVIEW_LENGTH = 100;

function parseVariantConfig(variant: VariantTemplate, index: number): string {
  if (!variant.config) {
    return JSON.stringify({});
  }

  try {
    const parsed = JSON.parse(variant.config);
    return JSON.stringify(parsed);
  } catch (error) {
    const preview = variant.config.substring(0, CONFIG_PREVIEW_LENGTH);
    const suffix = variant.config.length > CONFIG_PREVIEW_LENGTH ? '...' : '';
    throw new Error(
      `Invalid JSON in variant "${variant.name}" (variant ${index}):\n` +
        `${error instanceof Error ? error.message : 'unknown error'}\n` +
        `Config: ${preview}${suffix}`
    );
  }
}

function buildVariants(template: ExperimentTemplate): Array<Record<string, unknown>> {
  if (template.variants && template.variants.length > 0) {
    return template.variants.map((v, index) => ({
      name: v.name,
      variant: v.variant ?? index,
      config: parseVariantConfig(v, index),
    }));
  }

  return [
    { name: DEFAULT_CONTROL_NAME, variant: 0, config: JSON.stringify({}) },
    { name: DEFAULT_TREATMENT_NAME, variant: 1, config: JSON.stringify({}) },
  ];
}

interface CustomFieldResult {
  values: Record<string, { type: string; value: string }> | undefined;
  warnings: string[];
}

type LookupUser = NonNullable<ResolverContext['users']>[number];

interface UserLookup {
  /** Users whose lowercased email equals `ref`, first one wins. */
  byEmail(ref: string): LookupUser | undefined;
  /** Users whose lowercased email or "first last" equals `ref`, in input order. */
  matching(ref: string): LookupUser[];
}

/**
 * Indexes users once so resolving each template reference is a map lookup
 * rather than a scan of every user (which was quadratic in owners x users).
 */
function indexUsers(users: ResolverContext['users']): UserLookup {
  const byEmail = new Map<string, number[]>();
  const byName = new Map<string, number[]>();
  const add = (map: Map<string, number[]>, key: string, index: number) => {
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  };
  const list = users ?? [];
  list.forEach((u, index) => {
    add(byEmail, u.email.toLowerCase(), index);
    add(byName, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim().toLowerCase(), index);
  });
  return {
    byEmail: (ref) => {
      const first = byEmail.get(ref)?.[0];
      return first === undefined ? undefined : list[first];
    },
    matching: (ref) => {
      const indexes = new Set([...(byEmail.get(ref) ?? []), ...(byName.get(ref) ?? [])]);
      return [...indexes].sort((a, b) => a - b).map((index) => list[index]!);
    },
  };
}

function buildCustomSectionFieldValues(
  context: ResolverContext,
  experimentType: string,
  ownerId: number | undefined,
  templateCustomFields?: Record<string, string>
): CustomFieldResult {
  const warnings: string[] = [];

  if (!context.customSectionFields || context.customSectionFields.length === 0) {
    if (templateCustomFields && Object.keys(templateCustomFields).length > 0) {
      for (const name of Object.keys(templateCustomFields)) {
        warnings.push(`Custom field "${name}" in template has no matching custom section field`);
      }
    }
    return { values: undefined, warnings };
  }

  const relevantFields = context.customSectionFields.filter(
    (f) => !f.archived && f.custom_section?.type === experimentType && !f.custom_section?.archived
  );

  // Build a case-insensitive map from template custom field keys to their values
  const templateFieldMap = new Map<string, string>();
  if (templateCustomFields) {
    for (const [key, val] of Object.entries(templateCustomFields)) {
      templateFieldMap.set(key.toLowerCase(), val);
    }
  }

  if (templateCustomFields) {
    const relevantKeys = new Set<string>();
    for (const f of relevantFields) {
      if (f.title) relevantKeys.add(String(f.title).toLowerCase());
      if (f.name) relevantKeys.add(String(f.name).toLowerCase());
    }
    for (const name of Object.keys(templateCustomFields)) {
      if (!relevantKeys.has(name.toLowerCase())) {
        warnings.push(`Custom field "${name}" in template has no matching custom section field`);
      }
    }
  }

  if (relevantFields.length === 0) {
    return { values: undefined, warnings };
  }

  const userLookup = indexUsers(context.users);
  const fieldValues: Record<string, { type: string; value: string }> = {};
  for (const field of relevantFields) {
    let value = field.default_value ?? '';
    if (field.type === 'user' && ownerId) {
      value = JSON.stringify({ selected: [{ userId: ownerId }] });
    }
    if (templateCustomFields) {
      const titleKey = (field.title ?? '').toLowerCase();
      const nameKey = (field.name ?? '').toLowerCase();
      const templateValue = templateFieldMap.get(titleKey) ?? templateFieldMap.get(nameKey);
      if (templateValue !== undefined) {
        if (field.type === 'user' && templateValue && !templateValue.startsWith('{')) {
          const userIds = templateValue
            .split(',')
            .map((ref) => {
              const trimmed = ref.trim();
              if (trimmed.startsWith('user:')) return parseInt(trimmed.slice(5), 10);
              return userLookup.byEmail(trimmed.toLowerCase())?.id;
            })
            .filter((id): id is number => id !== undefined && !isNaN(id));
          value = JSON.stringify({ selected: userIds.map((userId) => ({ userId })) });
        } else {
          value = templateValue;
        }
      }
    }
    fieldValues[field.id] = { type: field.type, value };
  }

  return { values: fieldValues, warnings };
}

async function buildVariantScreenshots(
  template: ExperimentTemplate,
  warnings: string[]
): Promise<Array<Record<string, unknown>>> {
  if (!template.variants) return [];

  const screenshots: Array<Record<string, unknown>> = [];
  for (const [index, v] of template.variants.entries()) {
    if (v.screenshot_id) {
      screenshots.push({
        variant: v.variant ?? index,
        screenshot_file_upload_id: v.screenshot_id,
        ...(v.screenshot_label ? { label: v.screenshot_label } : {}),
      });
      continue;
    }

    if (!v.screenshot) continue;

    let resolved;
    try {
      resolved = await resolveScreenshot(v.screenshot, v.name);
    } catch (error) {
      warnings.push(
        `Screenshot for variant "${v.name}" failed: ${error instanceof Error ? error.message : error}`
      );
      continue;
    }
    if (!resolved) continue;

    screenshots.push({
      variant: v.variant ?? index,
      file_upload: resolved,
      ...(v.screenshot_label ? { label: v.screenshot_label } : {}),
    });
  }

  return screenshots;
}

const KNOWN_TEMPLATE_KEYS = new Set([
  'name',
  'display_name',
  'type',
  'state',
  'percentage_of_traffic',
  'percentages',
  'unit_type',
  'application',
  'primary_metric',
  'secondary_metrics',
  'guardrail_metrics',
  'exploratory_metrics',
  'owner_id',
  'owners',
  'teams',
  'tags',
  'audience',
  'variants',
  'custom_fields',
  'analysis_type',
  'required_alpha',
  'required_power',
  'baseline_participants',
  'minimum_detectable_effect',
  'baseline_primary_metric_mean',
  'baseline_primary_metric_stdev',
  'group_sequential_futility_type',
  'group_sequential_analysis_count',
  'group_sequential_min_analysis_interval',
  'group_sequential_first_analysis_interval',
  'group_sequential_max_duration_interval',
]);

export interface BuildPayloadResult {
  payload: Record<string, unknown>;
  warnings: string[];
}

export async function buildExperimentPayload(
  template: ExperimentTemplate,
  context: ResolverContext,
  defaultType = 'test'
): Promise<BuildPayloadResult> {
  const warnings: string[] = [];

  for (const key of Object.keys(template)) {
    if (!KNOWN_TEMPLATE_KEYS.has(key) && (template as Record<string, unknown>)[key] !== undefined) {
      warnings.push(`Unknown template field "${key}" will be ignored`);
    }
  }
  const experimentType = template.type ?? defaultType;
  const variants = buildVariants(template);

  const analysisType = template.analysis_type ?? DEFAULT_ANALYSIS_TYPE;

  const payload: Record<string, unknown> = {
    name: template.name,
    display_name: template.display_name ?? template.name,
    type: experimentType,
    state: template.state ?? DEFAULT_STATE,
    percentage_of_traffic: template.percentage_of_traffic ?? DEFAULT_TRAFFIC,
    percentages: template.percentages ?? DEFAULT_PERCENTAGES,
    analysis_type: analysisType,
    required_alpha: template.required_alpha ?? DEFAULT_REQUIRED_ALPHA,
    required_power: template.required_power ?? DEFAULT_REQUIRED_POWER,
    baseline_participants_per_day: template.baseline_participants ?? DEFAULT_BASELINE_PARTICIPANTS,
    audience: DEFAULT_AUDIENCE,
    audience_strict: false,
    nr_variants: variants.length,
    variants,
    secondary_metrics: [],
    teams: [],
    experiment_tags: [],
  };

  if (template.minimum_detectable_effect)
    payload.minimum_detectable_effect = template.minimum_detectable_effect;
  if (template.baseline_primary_metric_mean)
    payload.baseline_primary_metric_mean = template.baseline_primary_metric_mean;
  if (template.baseline_primary_metric_stdev)
    payload.baseline_primary_metric_stdev = template.baseline_primary_metric_stdev;

  if (analysisType === 'group_sequential') {
    payload.group_sequential_futility_type =
      template.group_sequential_futility_type ?? DEFAULT_FUTILITY_TYPE;
    if (template.group_sequential_analysis_count)
      payload.group_sequential_analysis_count = template.group_sequential_analysis_count;
    payload.group_sequential_min_analysis_interval =
      template.group_sequential_min_analysis_interval ?? DEFAULT_MIN_ANALYSIS_INTERVAL;
    payload.group_sequential_first_analysis_interval =
      template.group_sequential_first_analysis_interval ?? DEFAULT_FIRST_ANALYSIS_INTERVAL;
    payload.group_sequential_max_duration_interval =
      template.group_sequential_max_duration_interval ?? DEFAULT_MAX_DURATION_INTERVAL;
  }

  const builtScreenshots = await buildVariantScreenshots(template, warnings);
  payload.variant_screenshots = builtScreenshots;

  if (template.application) {
    const app = resolveByName(context.applications, template.application, 'Application');
    payload.applications = [{ application_id: app.id, application_version: '0' }];
  }

  if (template.unit_type) {
    const unitType = resolveByName(context.unitTypes, template.unit_type, 'Unit type');
    payload.unit_type = { unit_type_id: unitType.id };
  }

  if (template.primary_metric) {
    const metric = resolveByName(context.metrics, template.primary_metric, 'Metric');
    payload.primary_metric = { metric_id: metric.id };
  }

  const metricResolver = createNameResolver(context.metrics);
  const resolveMetricNames = (names: string[] | undefined, label: string) =>
    (names ?? []).map((name) => metricResolver(name, label));

  const allMetrics = buildSecondaryMetrics({
    secondary: resolveMetricNames(template.secondary_metrics, 'Secondary metric'),
    guardrail: resolveMetricNames(template.guardrail_metrics, 'Guardrail metric'),
    exploratory: resolveMetricNames(template.exploratory_metrics, 'Exploratory metric'),
  });

  if (allMetrics.length > 0) {
    payload.secondary_metrics = allMetrics;
  }

  let ownerId: number | undefined;
  if (template.owners && template.owners.length > 0 && context.users) {
    const userLookup = indexUsers(context.users);
    const resolvedOwners: Array<{ user_id: number }> = [];
    for (const ownerRef of template.owners) {
      const asInt = parseInt(String(ownerRef), 10);
      if (!isNaN(asInt) && String(asInt) === String(ownerRef).trim()) {
        resolvedOwners.push({ user_id: asInt });
      } else {
        const raw = String(ownerRef).trim();
        const ref = (extractAngleBracketed(raw) ?? raw).toLowerCase();
        const matches = userLookup.matching(ref);
        if (matches.length === 1) {
          resolvedOwners.push({ user_id: matches[0]!.id });
        } else if (matches.length > 1) {
          const suggestions = matches.map((u) => `${u.email} (id: ${u.id})`).join(', ');
          warnings.push(
            `Owner "${ownerRef}" matches multiple users: ${suggestions}. Use email to disambiguate.`
          );
        } else {
          warnings.push(`Owner "${ownerRef}" not found, skipping`);
        }
      }
    }
    if (resolvedOwners.length > 0) {
      payload.owners = resolvedOwners;
      ownerId = resolvedOwners[0]!.user_id;
    }
  } else if (template.owner_id) {
    ownerId = Number(template.owner_id);
    payload.owners = [{ user_id: ownerId }];
  }

  if (template.teams && template.teams.length > 0 && context.teams) {
    const teamByName = new Map<string, (typeof context.teams)[number]>();
    for (const team of context.teams) {
      const key = team.name.toLowerCase();
      if (!teamByName.has(key)) teamByName.set(key, team);
    }
    const resolvedTeams: Array<{ team_id: number }> = [];
    for (const teamName of template.teams) {
      const team = teamByName.get(teamName.toLowerCase());
      if (team) {
        resolvedTeams.push({ team_id: team.id });
      } else {
        warnings.push(`Team "${teamName}" not found, skipping`);
      }
    }
    if (resolvedTeams.length > 0) payload.teams = resolvedTeams;
  }

  if (template.tags && template.tags.length > 0 && context.experimentTags) {
    const tagByName = new Map<string, (typeof context.experimentTags)[number]>();
    for (const tag of context.experimentTags) {
      const key = tag.tag.toLowerCase();
      if (!tagByName.has(key)) tagByName.set(key, tag);
    }
    const resolvedTags: Array<{ experiment_tag_id: number }> = [];
    for (const tagName of template.tags) {
      const tag = tagByName.get(tagName.toLowerCase());
      if (tag) {
        resolvedTags.push({ experiment_tag_id: tag.id });
      } else {
        warnings.push(`Tag "${tagName}" not found, skipping`);
      }
    }
    if (resolvedTags.length > 0) payload.experiment_tags = resolvedTags;
  }

  if (template.audience) {
    try {
      payload.audience = JSON.stringify(JSON.parse(template.audience));
    } catch {
      warnings.push(
        'Audience value is not valid JSON and will be sent as-is. Verify the syntax in your template.'
      );
      payload.audience = template.audience;
    }
  }

  const customFieldResult = buildCustomSectionFieldValues(
    context,
    experimentType,
    ownerId,
    template.custom_fields
  );
  if (customFieldResult.values) {
    payload.custom_section_field_values = customFieldResult.values;
  }
  warnings.push(...customFieldResult.warnings);

  return { payload, warnings };
}
