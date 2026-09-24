import { formatDate, resolveDotPath } from './format-helpers.js';
import { formatUserSummary } from '../lib/output/formatter.js';

export function applyShowExclude(
  summary: Record<string, unknown>,
  raw: Record<string, unknown>,
  extraFields: string[] = [],
  excludeFields: string[] = [],
  onlyFields?: string[]
): Record<string, unknown> {
  const resolveExtra = (field: string): unknown => {
    if (field in summary) return summary[field];
    if (field in raw) return raw[field];
    if (field.includes('.')) {
      const resolved = resolveDotPath(raw, field);
      if (resolved === undefined) return undefined;
      if (Array.isArray(resolved) && resolved.every((v) => v === undefined)) return undefined;
      return resolved;
    }
    return undefined;
  };

  if (onlyFields && onlyFields.length > 0) {
    const result: Record<string, unknown> = {};
    for (const field of onlyFields) {
      const value = resolveExtra(field);
      if (value !== undefined) {
        result[field] = value;
      }
    }
    return result;
  }
  for (const field of extraFields) {
    if (field in summary) continue;
    const value = resolveExtra(field);
    if (value !== undefined) {
      summary[field] = value;
    }
  }
  if (excludeFields.length > 0) {
    for (const field of excludeFields) delete summary[field];
  }
  return summary;
}

function formatOwner(obj: Record<string, unknown> | undefined): string {
  if (!obj) return '';
  return formatUserSummary(obj) ?? '';
}

export function summarizeMetric(m: Record<string, unknown>): Record<string, unknown> {
  const goal = m.goal as Record<string, unknown> | undefined;
  const category = m.metric_category as Record<string, unknown> | undefined;
  const tags = m.tags as Array<Record<string, unknown>> | undefined;
  const owners = m.owners as Array<Record<string, unknown>> | undefined;

  return {
    id: m.id,
    name: m.name,
    type: m.type,
    effect: m.effect ?? '',
    status: m.lifecycle_status ?? '',
    goal: goal?.name ?? m.goal_id ?? '',
    category: category?.name ?? '',
    description: m.description ?? '',
    owners: owners?.map((o) => formatOwner(o.user as Record<string, unknown>)).join(', ') ?? '',
    tags:
      tags
        ?.map((t) => (t.metric_tag as Record<string, unknown>)?.tag ?? '')
        .filter(Boolean)
        .join(', ') ?? '',
    created_at: formatDate(m.created_at),
    updated_at: formatDate(m.updated_at),
  };
}

export function summarizeMetricRow(m: Record<string, unknown>): Record<string, unknown> {
  const goal = m.goal as Record<string, unknown> | undefined;
  const category = m.metric_category as Record<string, unknown> | undefined;

  return {
    id: m.id,
    name: m.name,
    type: m.type,
    effect: m.effect ?? '',
    status: m.lifecycle_status ?? '',
    goal: goal?.name ?? m.goal_id ?? '',
    category: category?.name ?? '',
  };
}

export function summarizeGoal(g: Record<string, unknown>): Record<string, unknown> {
  const tags = g.tags as Array<Record<string, unknown>> | undefined;
  const createdBy = g.created_by as Record<string, unknown> | undefined;

  return {
    id: g.id,
    name: g.name,
    description: g.description ?? '',
    tags:
      tags
        ?.map((t) => (t.goal_tag as Record<string, unknown>)?.tag ?? '')
        .filter(Boolean)
        .join(', ') ?? '',
    created_by: formatOwner(createdBy),
    created_at: formatDate(g.created_at),
    updated_at: formatDate(g.updated_at),
    archived: g.archived ?? false,
  };
}

export function summarizeGoalRow(g: Record<string, unknown>): Record<string, unknown> {
  const tags = g.tags as Array<Record<string, unknown>> | undefined;

  return {
    id: g.id,
    name: g.name,
    tags:
      tags
        ?.map((t) => (t.goal_tag as Record<string, unknown>)?.tag ?? '')
        .filter(Boolean)
        .join(', ') ?? '',
    archived: g.archived ?? false,
  };
}

export function summarizeTeam(t: Record<string, unknown>): Record<string, unknown> {
  const parentTeam = t.parent_team as Record<string, unknown> | undefined;
  const createdBy = t.created_by as Record<string, unknown> | undefined;

  return {
    id: t.id,
    name: t.name,
    initials: t.initials ?? '',
    description: t.description ?? '',
    parent: parentTeam?.name ?? t.parent_team_id ?? '',
    created_by: formatOwner(createdBy),
    created_at: formatDate(t.created_at),
    archived: t.archived ?? false,
  };
}

export function summarizeTeamRow(t: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    initials: t.initials ?? '',
    description: t.description ?? '',
    archived: t.archived ?? false,
  };
}

export function summarizeUserRow(u: Record<string, unknown>): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    department: u.department ?? '',
    job_title: u.job_title ?? '',
    archived: u.archived ?? false,
    last_login: formatDate(u.last_login_at),
  };
}

export function summarizeUserDetail(u: Record<string, unknown>): Record<string, unknown> {
  return {
    id: u.id,
    email: u.email,
    name: [u.first_name, u.last_name].filter(Boolean).join(' '),
    department: u.department ?? '',
    job_title: u.job_title ?? '',
    archived: u.archived ?? false,
    last_login: formatDate(u.last_login_at),
    created_at: formatDate(u.created_at),
    updated_at: formatDate(u.updated_at),
  };
}

export function summarizeSegment(s: Record<string, unknown>): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    attribute: s.value_source_attribute ?? '',
    created_at: formatDate(s.created_at),
    archived: s.archived ?? false,
  };
}

export function summarizeSegmentRow(s: Record<string, unknown>): Record<string, unknown> {
  return {
    id: s.id,
    name: s.name,
    attribute: s.value_source_attribute ?? '',
    archived: s.archived ?? false,
  };
}

export function summarizeCustomFieldRow(f: Record<string, unknown>): Record<string, unknown> {
  const section = f.custom_section as Record<string, unknown> | undefined;
  return {
    id: f.id,
    title: f.title ?? f.name ?? '',
    type: f.type ?? '',
    required: f.required ?? false,
    section: section?.title ?? '',
    section_type: section?.type ?? '',
    archived: f.archived ?? false,
  };
}

export function summarizeCustomField(f: Record<string, unknown>): Record<string, unknown> {
  const section = f.custom_section as Record<string, unknown> | undefined;
  return {
    id: f.id,
    title: f.title ?? f.name ?? '',
    type: f.type ?? '',
    required: f.required ?? false,
    help_text: f.help_text ?? '',
    placeholder: f.placeholder ?? '',
    default_value: f.default_value ?? '',
    section: section?.title ?? '',
    section_type: section?.type ?? '',
    order_index: f.order_index ?? 0,
    available_in_sdk: f.available_in_sdk ?? false,
    sdk_field_name: f.sdk_field_name ?? '',
    archived: f.archived ?? false,
    created_at: formatDate(f.created_at),
  };
}

export function summarizeTagRow(t: Record<string, unknown>): Record<string, unknown> {
  return {
    id: t.id,
    tag: t.tag ?? '',
    archived: t.archived ?? false,
    created_at: t.created_at ?? '',
    created_by: formatOwner(t.created_by as Record<string, unknown> | undefined),
    updated_at: t.updated_at ?? '',
    updated_by: formatOwner(t.updated_by as Record<string, unknown> | undefined),
  };
}

export function summarizeMetricCategoryRow(c: Record<string, unknown>): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name ?? '',
    description: c.description ?? '',
    color: c.color ?? '',
    archived: c.archived ?? false,
    created_at: c.created_at ?? '',
    created_by: formatOwner(c.created_by as Record<string, unknown> | undefined),
    updated_at: c.updated_at ?? '',
    updated_by: formatOwner(c.updated_by as Record<string, unknown> | undefined),
  };
}

export function summarizeNamedEntityRow(e: Record<string, unknown>): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name ?? '',
    description: e.description ?? '',
    archived: e.archived ?? false,
    created_at: e.created_at ?? '',
    created_by: formatOwner(e.created_by as Record<string, unknown> | undefined),
    updated_at: e.updated_at ?? '',
    updated_by: formatOwner(e.updated_by as Record<string, unknown> | undefined),
  };
}

export function summarizeWebhook(w: Record<string, unknown>): Record<string, unknown> {
  const events = w.events as Array<string> | undefined;
  return {
    id: w.id,
    name: w.name ?? '',
    url: w.url ?? '',
    description: w.description ?? '',
    enabled: w.enabled ?? false,
    ordered: w.ordered ?? false,
    max_retries: w.max_retries ?? 0,
    events: events?.join(', ') ?? '',
    archived: w.archived ?? false,
    created_at: formatDate(w.created_at),
    created_by: formatOwner(w.created_by as Record<string, unknown> | undefined),
    updated_at: formatDate(w.updated_at),
    updated_by: formatOwner(w.updated_by as Record<string, unknown> | undefined),
  };
}

export function summarizeWebhookRow(w: Record<string, unknown>): Record<string, unknown> {
  return {
    id: w.id,
    name: w.name ?? '',
    url: w.url ?? '',
    enabled: w.enabled ?? false,
    ordered: w.ordered ?? false,
    max_retries: w.max_retries ?? 0,
    archived: w.archived ?? false,
    created_at: w.created_at ?? '',
    created_by: formatOwner(w.created_by as Record<string, unknown> | undefined),
    updated_at: w.updated_at ?? '',
    updated_by: formatOwner(w.updated_by as Record<string, unknown> | undefined),
  };
}
