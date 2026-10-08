import {
  formatExtraField,
  formatImpact,
  formatConfidence,
  formatProgress,
  formatOwnerName,
  formatDate,
  resolveDotPath,
} from './format-helpers.js';

const METRIC_ROLE_FIELDS = new Set([
  'secondary_metrics',
  'guardrail_metrics',
  'exploratory_metrics',
]);

// `secondary_metrics` holds every non-primary metric, distinguished by `type`
// (empty means secondary). Groups metric names into `<type>_metrics` columns.
function metricNamesByRole(
  metrics: Array<Record<string, unknown>> | undefined
): Map<string, string[]> {
  const byRole = new Map<string, string[]>();
  for (const m of metrics ?? []) {
    const field = `${(m.type as string) || 'secondary'}_metrics`;
    const name = String((m.metric as Record<string, unknown>)?.name ?? m.metric_id);
    byRole.set(field, [...(byRole.get(field) ?? []), name]);
  }
  return byRole;
}

export function summarizeExperiment(
  exp: Record<string, unknown>,
  extraFields: string[] = [],
  excludeFields: string[] = [],
  onlyFields?: string[]
): Record<string, unknown> {
  const apps = exp.applications as Array<Record<string, unknown>> | undefined;
  const unitType = exp.unit_type as Record<string, unknown> | undefined;
  const primaryMetric = exp.primary_metric as Record<string, unknown> | undefined;
  const variants = exp.variants as Array<Record<string, unknown>> | undefined;
  const owners = exp.owners as Array<Record<string, unknown>> | undefined;
  const teams = exp.teams as Array<Record<string, unknown>> | undefined;
  const tags = exp.experiment_tags as Array<Record<string, unknown>> | undefined;
  const secondaryMetrics = exp.secondary_metrics as Array<Record<string, unknown>> | undefined;

  const summary: Record<string, unknown> = {
    id: exp.id,
    name: exp.name,
    display_name: exp.display_name ?? '',
    type: exp.type,
    state: exp.state,
    application:
      apps?.map((a) => (a.application as Record<string, unknown>)?.name ?? a.name).join(', ') ?? '',
    unit_type: unitType?.name ?? '',
    percentage_of_traffic: exp.percentage_of_traffic,
    primary_metric: primaryMetric?.name ?? '',
    variants: variants?.map((v) => v.name || `variant ${v.variant}`).join(', ') ?? '',
    percentages: exp.percentages ?? '',
  };

  for (const [field, names] of metricNamesByRole(secondaryMetrics)) {
    if (METRIC_ROLE_FIELDS.has(field)) summary[field] = names.join(', ');
  }

  const previewVariants = exp.preview_variants as Array<Record<string, unknown>> | undefined;
  const primaryMetricId = exp.primary_metric_id as number | undefined;
  if (previewVariants && primaryMetricId) {
    const primaryResults = previewVariants.filter(
      (v) => v.metric_id === primaryMetricId && (v.variant as number) > 0
    );
    for (const result of primaryResults) {
      const variantIdx = result.variant as number;
      const variantName =
        variants?.find((v) => v.variant === variantIdx)?.name || `variant ${variantIdx}`;
      const parts: string[] = [];

      const unitCount = Number(result.unit_count);
      if (unitCount > 0) parts.push(`n=${unitCount.toLocaleString()}`);

      const impact = result.impact as number | null | undefined;
      if (typeof impact === 'number' && Number.isFinite(impact))
        parts.push(`impact=${(impact * 100).toFixed(2)}%`);

      const pvalue = result.pvalue as number | null | undefined;
      if (typeof pvalue === 'number' && Number.isFinite(pvalue))
        parts.push(`p=${pvalue < 0.001 ? '<0.001' : pvalue.toFixed(4)}`);

      const impactLower = result.impact_lower as number | null | undefined;
      const impactUpper = result.impact_upper as number | null | undefined;
      if (
        typeof impactLower === 'number' &&
        Number.isFinite(impactLower) &&
        typeof impactUpper === 'number' &&
        Number.isFinite(impactUpper)
      ) {
        parts.push(`CI=[${(impactLower * 100).toFixed(2)}%, ${(impactUpper * 100).toFixed(2)}%]`);
      }

      if (parts.length > 0) {
        summary[`result (${variantName})`] = parts.join('  ');
      }
    }
  }

  summary.owners = owners?.map((o) => formatOwnerName(o)).join(', ') ?? '';
  summary.teams =
    teams
      ?.map((t) => (t.team as Record<string, unknown>)?.name ?? t.name ?? '')
      .filter(Boolean)
      .join(', ') ?? '';
  summary.tags =
    tags
      ?.map(
        (t) =>
          (t.tag as Record<string, unknown>)?.name ??
          (t.experiment_tag as Record<string, unknown>)?.tag ??
          t.tag ??
          ''
      )
      .filter(Boolean)
      .join(', ') ?? '';
  summary.created_at = formatDate(exp.created_at);
  summary.updated_at = formatDate(exp.updated_at);
  summary.start_at = formatDate(exp.start_at);
  summary.stop_at = formatDate(exp.stop_at);

  const customFieldValues = exp.custom_section_field_values as
    | Array<Record<string, unknown>>
    | undefined;
  const customFields = new Map<string, string>();
  if (customFieldValues) {
    for (const cfv of customFieldValues) {
      const field = cfv.custom_section_field as Record<string, unknown> | undefined;
      const title = (field?.title as string) ?? '';
      const value = (cfv.value as string) ?? '';
      if (title) customFields.set(title.toLowerCase(), value);
    }
  }

  const lookupFields = onlyFields ? [...extraFields, ...onlyFields] : extraFields;
  for (const field of lookupFields) {
    if (field in summary) continue;

    if (field in exp) {
      summary[field] = formatExtraField(field, exp[field]);
    } else if (field.includes('.')) {
      const resolved = resolveDotPath(exp, field);
      if (resolved !== undefined) {
        if (!(Array.isArray(resolved) && resolved.every((v) => v === undefined))) {
          summary[field] = resolved;
        }
      }
    } else {
      const customValue = customFields.get(field.toLowerCase());
      if (customValue !== undefined) {
        summary[field] = customValue;
      }
    }
  }

  if (onlyFields && onlyFields.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const field of onlyFields) {
      if (field in summary) filtered[field] = summary[field];
    }
    return filtered;
  }

  if (excludeFields.length > 0) {
    for (const field of excludeFields) delete summary[field];
  }

  return summary;
}

export function stateToDate(state: string, exp: Record<string, unknown>): string {
  let date: string | undefined;
  switch (state) {
    case 'running':
      date = exp.start_at as string;
      break;
    case 'stopped':
      date = exp.stop_at as string;
      break;
    case 'archived':
      date = exp.stop_at as string;
      break;
    default:
      date = exp.created_at as string;
      break;
  }
  return formatDate(date);
}

const DEFAULT_ROW_EXCLUDES = ['unit_type', 'traffic', 'owner'];

export function summarizeExperimentRow(
  exp: Record<string, unknown>,
  extraFields: string[] = [],
  excludeFields: string[] = [],
  onlyFields?: string[]
): Record<string, unknown> {
  const showSet = new Set(extraFields.map((f) => f.toLowerCase()));
  const effectiveExcludes = [
    ...DEFAULT_ROW_EXCLUDES.filter((f) => !showSet.has(f)),
    ...excludeFields,
  ];
  excludeFields = effectiveExcludes;
  const apps = exp.applications as Array<Record<string, unknown>> | undefined;
  const unitType = exp.unit_type as Record<string, unknown> | undefined;
  const primaryMetric = exp.primary_metric as Record<string, unknown> | undefined;
  const owners = exp.owners as Array<Record<string, unknown>> | undefined;

  const state = exp.state as string;
  const stateDate = stateToDate(state, exp);

  const row: Record<string, unknown> = {
    id: exp.id,
    name: exp.name,
    type: exp.type,
    state,
    state_since: stateDate,
    app:
      apps?.map((a) => (a.application as Record<string, unknown>)?.name ?? a.name).join(', ') ?? '',
    unit_type: unitType?.name ?? '',
    traffic: `${exp.percentage_of_traffic}%`,
    primary_metric: primaryMetric?.name ?? '',
    owner: owners?.map((o) => formatOwnerName(o)).join(', ') ?? '',
    percentages: exp.percentages ?? '',
    impact: formatImpact(exp),
    confidence: formatConfidence(exp),
    progress: formatProgress(exp),
  };

  const lookupFields = onlyFields ? [...extraFields, ...onlyFields] : extraFields;
  const roleNames = lookupFields.some((f) => METRIC_ROLE_FIELDS.has(f.toLowerCase()))
    ? metricNamesByRole(exp.secondary_metrics as Array<Record<string, unknown>> | undefined)
    : undefined;
  for (const field of lookupFields) {
    if (field in row) continue;
    if (roleNames && METRIC_ROLE_FIELDS.has(field.toLowerCase())) {
      row[field] = roleNames.get(field.toLowerCase()) ?? [];
      continue;
    }
    if (field in exp) {
      row[field] = formatExtraField(field, exp[field]);
    } else if (field.includes('.')) {
      const resolved = resolveDotPath(exp, field);
      if (resolved !== undefined) {
        if (!(Array.isArray(resolved) && resolved.every((v) => v === undefined))) {
          row[field] = resolved;
        }
      }
    }
  }

  if (onlyFields && onlyFields.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const field of onlyFields) {
      if (field in row) filtered[field] = row[field];
    }
    return filtered;
  }

  if (excludeFields.length > 0) {
    for (const field of excludeFields) delete row[field];
  }

  return row;
}
