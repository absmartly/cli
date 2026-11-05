import { describe, it, expect } from 'vitest';
import {
  applyShowExclude,
  summarizeMetric,
  summarizeMetricRow,
  summarizeGoal,
  summarizeGoalRow,
  summarizeTeam,
  summarizeTeamRow,
  summarizeUserRow,
  summarizeUserDetail,
  summarizeSegment,
  summarizeSegmentRow,
  summarizeTagRow,
  summarizeMetricCategoryRow,
  summarizeNamedEntityRow,
  summarizeWebhookRow,
  summarizeWebhook,
} from './entity-summary.js';

describe('applyShowExclude', () => {
  it('should add extra fields from raw data', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', extra: 'value' };
    const result = applyShowExclude(summary, raw, ['extra']);
    expect(result.extra).toBe('value');
  });

  it('should remove excluded fields', () => {
    const summary = { id: 1, name: 'test', description: 'desc' };
    const raw = { id: 1, name: 'test', description: 'desc' };
    const result = applyShowExclude(summary, raw, [], ['description']);
    expect(result).not.toHaveProperty('description');
  });

  it('should handle both show and exclude together', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', extra: 'value' };
    const result = applyShowExclude(summary, raw, ['extra'], ['name']);
    expect(result.extra).toBe('value');
    expect(result).not.toHaveProperty('name');
  });

  it('should return only the requested fields when onlyFields is provided', () => {
    const summary = { id: 1, name: 'test', description: 'desc' };
    const raw = { id: 1, name: 'test', description: 'desc' };
    const result = applyShowExclude(summary, raw, [], [], ['id', 'name']);
    expect(Object.keys(result)).toEqual(['id', 'name']);
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('should preserve onlyFields order even when summary order differs', () => {
    const summary = { id: 1, name: 'test', description: 'desc' };
    const raw = summary;
    const result = applyShowExclude(summary, raw, [], [], ['description', 'id']);
    expect(Object.keys(result)).toEqual(['description', 'id']);
  });

  it('should resolve onlyFields not in summary from raw', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', extra: 'from-raw' };
    const result = applyShowExclude(summary, raw, [], [], ['extra']);
    expect(result).toEqual({ extra: 'from-raw' });
  });

  it('should skip onlyFields that are absent from both summary and raw', () => {
    const summary = { id: 1 };
    const raw = { id: 1 };
    const result = applyShowExclude(summary, raw, [], [], ['nonexistent']);
    expect(result).toEqual({});
  });

  it('should ignore extraFields and excludeFields when onlyFields is set', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', extra: 'value' };
    const result = applyShowExclude(summary, raw, ['extra'], ['id'], ['name']);
    expect(result).toEqual({ name: 'test' });
  });

  it('should fall back to existing show/exclude behavior when onlyFields is undefined', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', extra: 'value' };
    const result = applyShowExclude(summary, raw, ['extra'], ['id']);
    expect(result).toEqual({ name: 'test', extra: 'value' });
  });

  it('resolves dot-path fields from raw', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', variants: [{ config: '{"x":1}' }, { config: '{"x":2}' }] };
    const result = applyShowExclude(summary, raw, ['variants.config']);
    expect(result['variants.config']).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it('resolves dot-path fields under onlyFields', () => {
    const summary = { id: 1, name: 'test' };
    const raw = { id: 1, name: 'test', variants: [{ config: '{"a":1}' }] };
    const result = applyShowExclude(summary, raw, [], [], ['variants.config']);
    expect(result).toEqual({ 'variants.config': [{ a: 1 }] });
  });

  it('skips dot-paths that resolve to undefined', () => {
    const summary = { id: 1 };
    const raw = { id: 1 };
    const result = applyShowExclude(summary, raw, ['nonexistent.path']);
    expect(result).not.toHaveProperty('nonexistent.path');
  });
});

describe('summarizeMetric', () => {
  it('should include key fields', () => {
    const result = summarizeMetric({
      id: 1,
      name: 'metric1',
      type: 'count',
      effect: 'positive',
      lifecycle_status: 'active',
      goal: { name: 'Revenue' },
      metric_category: { name: 'Business' },
      created_at: '2024-01-15T10:00:00Z',
    });
    expect(result).toHaveProperty('id', 1);
    expect(result).toHaveProperty('name', 'metric1');
    expect(result).toHaveProperty('type', 'count');
    expect(result).toHaveProperty('goal', 'Revenue');
    expect(result).toHaveProperty('category', 'Business');
  });
});

describe('summarizeMetricRow', () => {
  it('should include key row fields', () => {
    const result = summarizeMetricRow({
      id: 1,
      name: 'metric1',
      type: 'count',
      goal_id: 5,
    });
    expect(result).toHaveProperty('id', 1);
    expect(result).toHaveProperty('name', 'metric1');
    expect(result).toHaveProperty('type', 'count');
    expect(result).toHaveProperty('goal', 5);
  });
});

describe('summarizeGoal', () => {
  it('should include key fields', () => {
    const result = summarizeGoal({
      id: 2,
      name: 'Revenue',
      description: 'Revenue goal',
      created_at: '2024-02-01T00:00:00Z',
      archived: false,
    });
    expect(result).toHaveProperty('id', 2);
    expect(result).toHaveProperty('name', 'Revenue');
    expect(result).toHaveProperty('description', 'Revenue goal');
    expect(result).toHaveProperty('archived', false);
  });
});

describe('summarizeGoalRow', () => {
  it('should include key row fields', () => {
    const result = summarizeGoalRow({ id: 2, name: 'Revenue', archived: false });
    expect(result).toHaveProperty('id', 2);
    expect(result).toHaveProperty('name', 'Revenue');
    expect(result).toHaveProperty('archived', false);
  });
});

describe('summarizeTeam', () => {
  it('should include key fields', () => {
    const result = summarizeTeam({
      id: 3,
      name: 'Platform',
      initials: 'PT',
      description: 'Platform team',
      parent_team: { name: 'Engineering' },
      created_at: '2024-03-01T00:00:00Z',
      archived: false,
    });
    expect(result).toHaveProperty('id', 3);
    expect(result).toHaveProperty('name', 'Platform');
    expect(result).toHaveProperty('initials', 'PT');
    expect(result).toHaveProperty('parent', 'Engineering');
  });
});

describe('summarizeTeamRow', () => {
  it('should include key row fields', () => {
    const result = summarizeTeamRow({ id: 3, name: 'Platform', initials: 'PT', archived: false });
    expect(result).toHaveProperty('id', 3);
    expect(result).toHaveProperty('name', 'Platform');
    expect(result).toHaveProperty('archived', false);
  });
});

describe('summarizeUserRow', () => {
  it('should include key row fields', () => {
    const result = summarizeUserRow({
      id: 10,
      email: 'user@example.com',
      first_name: 'John',
      last_name: 'Doe',
      archived: false,
    });
    expect(result).toHaveProperty('id', 10);
    expect(result).toHaveProperty('email', 'user@example.com');
    expect(result).toHaveProperty('name', 'John Doe');
    expect(result).toHaveProperty('archived', false);
  });
});

describe('summarizeUserDetail', () => {
  it('should include key detail fields', () => {
    const result = summarizeUserDetail({
      id: 10,
      email: 'user@example.com',
      first_name: 'John',
      last_name: 'Doe',
      archived: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
    });
    expect(result).toHaveProperty('id', 10);
    expect(result).toHaveProperty('name', 'John Doe');
    expect(result).toHaveProperty('created_at');
    expect(result.created_at).toBeTruthy();
    expect(result).toHaveProperty('updated_at');
    expect(result.updated_at).toBeTruthy();
  });
});

describe('summarizeSegment', () => {
  it('should include key fields', () => {
    const result = summarizeSegment({
      id: 5,
      name: 'Mobile Users',
      description: 'Users on mobile',
      value_source_attribute: 'device',
      created_at: '2024-04-01T00:00:00Z',
      archived: false,
    });
    expect(result).toHaveProperty('id', 5);
    expect(result).toHaveProperty('name', 'Mobile Users');
    expect(result).toHaveProperty('attribute', 'device');
    expect(result).toHaveProperty('archived', false);
  });
});

describe('summarizeSegmentRow', () => {
  it('should include key row fields', () => {
    const result = summarizeSegmentRow({
      id: 5,
      name: 'Mobile Users',
      value_source_attribute: 'device',
      archived: false,
    });
    expect(result).toHaveProperty('id', 5);
    expect(result).toHaveProperty('name', 'Mobile Users');
    expect(result).toHaveProperty('attribute', 'device');
  });
});

describe('summarizeGoal created_by field', () => {
  it('returns full name when first and last are present', () => {
    const result = summarizeGoal({
      id: 1,
      name: 'g',
      created_by: { first_name: 'Joe', last_name: 'Bloggs' },
    });
    expect(result.created_by).toBe('Joe Bloggs');
  });

  it('returns email when name parts are missing', () => {
    const result = summarizeGoal({
      id: 1,
      name: 'g',
      created_by: { email: 'joe@example.com' },
    });
    expect(result.created_by).toBe('joe@example.com');
  });

  it('returns empty string for null created_by', () => {
    const result = summarizeGoal({ id: 1, name: 'g', created_by: null });
    expect(result.created_by).toBe('');
  });
});

describe('summarizeTagRow', () => {
  it('curates the simple tag columns and summarizes user fields', () => {
    expect(
      summarizeTagRow({
        id: 7,
        tag: 'top-priority',
        archived: false,
        created_at: '2024-05-22T10:29:34.375Z',
        created_by: { first_name: 'Joe', last_name: 'Bloggs' },
        updated_at: null,
        updated_by: null,
      })
    ).toEqual({
      id: 7,
      tag: 'top-priority',
      archived: false,
      created_at: '2024-05-22T10:29:34.375Z',
      created_by: 'Joe Bloggs',
      updated_at: '',
      updated_by: '',
    });
  });

  it('defaults archived to false when missing', () => {
    expect(summarizeTagRow({ id: 1, tag: 't' }).archived).toBe(false);
  });
});

describe('summarizeMetricCategoryRow', () => {
  it('picks the useful columns and summarizes user fields', () => {
    expect(
      summarizeMetricCategoryRow({
        id: 3,
        name: 'Revenue',
        description: 'all revenue metrics',
        color: '#ff5733',
        archived: false,
        created_at: '2024-05-22T10:29:34.375Z',
        created_by: { first_name: 'Joe', last_name: 'Bloggs' },
        updated_at: null,
        updated_by: null,
      })
    ).toEqual({
      id: 3,
      name: 'Revenue',
      description: 'all revenue metrics',
      color: '#ff5733',
      archived: false,
      created_at: '2024-05-22T10:29:34.375Z',
      created_by: 'Joe Bloggs',
      updated_at: '',
      updated_by: '',
    });
  });
});

describe('summarizeNamedEntityRow', () => {
  it('curates id/name/description/archived plus user/time audit fields', () => {
    expect(
      summarizeNamedEntityRow({
        id: 4,
        name: 'production',
        description: 'production env',
        archived: false,
        created_at: '2024-05-22T10:29:34.375Z',
        created_by: { first_name: 'Joe', last_name: 'Bloggs' },
        updated_at: '2024-05-23T10:29:34.375Z',
        updated_by: { email: 'admin@x' },
      })
    ).toEqual({
      id: 4,
      name: 'production',
      description: 'production env',
      archived: false,
      created_at: '2024-05-22T10:29:34.375Z',
      created_by: 'Joe Bloggs',
      updated_at: '2024-05-23T10:29:34.375Z',
      updated_by: 'admin@x',
    });
  });

  it('keeps description empty if missing', () => {
    expect(summarizeNamedEntityRow({ id: 1, name: 'x' }).description).toBe('');
  });
});

describe('summarizeWebhook', () => {
  it('should include detail fields and join event subscription names', () => {
    const result = summarizeWebhook({
      id: 3,
      name: 'Slack notify',
      url: 'https://hooks.example.com/abc',
      enabled: true,
      ordered: false,
      max_retries: 2,
      archived: false,
      description: 'notifies slack',
      events: [
        {
          webhook_id: 3,
          webhook_event_id: 1,
          enabled: true,
          event: { id: 1, name: 'ExperimentCreated', description: 'Experiment created' },
        },
        {
          webhook_id: 3,
          webhook_event_id: 2,
          enabled: true,
          event: { id: 2, name: 'ExperimentDevelopment', description: 'Experiment started' },
        },
      ],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      secret: 'super-secret-should-be-dropped',
    });
    expect(result).toMatchObject({
      id: 3,
      name: 'Slack notify',
      url: 'https://hooks.example.com/abc',
      enabled: true,
      description: 'notifies slack',
      events: 'ExperimentCreated, ExperimentDevelopment',
    });
    expect(result).not.toHaveProperty('secret');
  });

  it('should not throw on missing/empty events and should fall back to empty string', () => {
    const result = summarizeWebhook({ id: 4, name: 'No events' });
    expect(result.events).toBe('');

    const emptyResult = summarizeWebhook({ id: 5, name: 'Empty events', events: [] });
    expect(emptyResult.events).toBe('');
  });

  it('should still join plain string events for backward compatibility', () => {
    const result = summarizeWebhook({
      id: 6,
      name: 'Legacy shape',
      events: ['experiment.created'],
    });
    expect(result.events).toBe('experiment.created');
  });
});

describe('summarizeWebhookRow', () => {
  it('curates webhook-specific columns and summarizes user fields', () => {
    expect(
      summarizeWebhookRow({
        id: 2,
        name: 'metrics-sync',
        url: 'https://example.com/hooks/metrics',
        enabled: true,
        ordered: false,
        max_retries: 5,
        archived: false,
        created_at: '2024-05-22T10:29:34.375Z',
        created_by: { first_name: 'Joe', last_name: 'Bloggs' },
        updated_at: null,
        updated_by: null,
      })
    ).toEqual({
      id: 2,
      name: 'metrics-sync',
      url: 'https://example.com/hooks/metrics',
      enabled: true,
      ordered: false,
      max_retries: 5,
      archived: false,
      created_at: '2024-05-22T10:29:34.375Z',
      created_by: 'Joe Bloggs',
      updated_at: '',
      updated_by: '',
    });
  });
});
