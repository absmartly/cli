import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listMetrics, listAllMetrics, resolveOwnerIds, resolveTeamIds } from './list.js';
import { getMetric } from './get.js';
import { createMetric } from './create.js';
import { updateMetric } from './update.js';
import { archiveMetric } from './archive.js';
import { activateMetric } from './activate.js';
import { createMetricVersion } from './new-version.js';
import { validateMetricFields } from './payload.js';
import { followMetric, unfollowMetric } from './follow.js';
import {
  listMetricAccessUsers,
  grantMetricAccessUser,
  revokeMetricAccessUser,
  listMetricAccessTeams,
  grantMetricAccessTeam,
  revokeMetricAccessTeam,
} from './access.js';
import {
  getMetricReview,
  requestMetricReview,
  approveMetricReview,
  listMetricReviewComments,
  addMetricReviewComment,
  replyToMetricReviewComment,
} from './review.js';
import { resolveGoalId } from '../resolve.js';

const mockClient = {
  listMetrics: vi.fn(),
  getMetric: vi.fn(),
  createMetric: vi.fn(),
  updateMetric: vi.fn(),
  archiveMetric: vi.fn(),
  activateMetric: vi.fn(),
  createMetricVersion: vi.fn(),
  followMetric: vi.fn(),
  unfollowMetric: vi.fn(),
  listMetricAccessUsers: vi.fn(),
  grantMetricAccessUser: vi.fn(),
  revokeMetricAccessUser: vi.fn(),
  listMetricAccessTeams: vi.fn(),
  grantMetricAccessTeam: vi.fn(),
  revokeMetricAccessTeam: vi.fn(),
  getMetricReview: vi.fn(),
  requestMetricReview: vi.fn(),
  approveMetricReview: vi.fn(),
  listMetricReviewComments: vi.fn(),
  addMetricReviewComment: vi.fn(),
  replyToMetricReviewComment: vi.fn(),
  resolveUsers: vi.fn(),
  resolveTeams: vi.fn(),
  resolveGoals: vi.fn(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('resolveOwnerIds', () => {
  it('should return numeric ids as-is', async () => {
    const result = await resolveOwnerIds(mockClient, '1,2,3');
    expect(result).toBe('1,2,3');
    expect(mockClient.resolveUsers).not.toHaveBeenCalled();
  });

  it('should resolve non-numeric refs via API', async () => {
    mockClient.resolveUsers.mockResolvedValue([{ id: 10 }, { id: 20 }]);

    const result = await resolveOwnerIds(mockClient, 'alice@test.com,bob@test.com');

    expect(mockClient.resolveUsers).toHaveBeenCalledWith(['alice@test.com', 'bob@test.com']);
    expect(result).toBe('10,20');
  });
});

describe('resolveTeamIds', () => {
  it('should return numeric ids as-is', async () => {
    const result = await resolveTeamIds(mockClient, '5,6');
    expect(result).toBe('5,6');
    expect(mockClient.resolveTeams).not.toHaveBeenCalled();
  });

  it('should resolve non-numeric refs via API', async () => {
    mockClient.resolveTeams.mockResolvedValue([{ id: 100 }]);

    const result = await resolveTeamIds(mockClient, 'team-alpha');

    expect(mockClient.resolveTeams).toHaveBeenCalledWith(['team-alpha']);
    expect(result).toBe('100');
  });
});

describe('resolveGoalId', () => {
  it('should return numeric id as-is', async () => {
    const result = await resolveGoalId(mockClient, '42');
    expect(result).toBe(42);
    expect(mockClient.resolveGoals).not.toHaveBeenCalled();
  });

  it('should resolve goal name via API', async () => {
    mockClient.resolveGoals.mockResolvedValue([{ id: 7, name: 'purchase' }]);

    const result = await resolveGoalId(mockClient, 'purchase');

    expect(mockClient.resolveGoals).toHaveBeenCalledWith(['purchase']);
    expect(result).toBe(7);
  });
});

describe('listMetrics', () => {
  it('should list metrics with pagination', async () => {
    const metrics = [{ id: 1 }, { id: 2 }];
    mockClient.listMetrics.mockResolvedValue(metrics);

    const result = await listMetrics(mockClient, { items: 10, page: 1 });

    expect(mockClient.listMetrics).toHaveBeenCalledWith({
      items: 10,
      page: 1,
      archived: undefined,
      include_drafts: undefined,
      search: undefined,
      sort: undefined,
      sort_asc: undefined,
      ids: undefined,
      owners: undefined,
      teams: undefined,
      review_status: undefined,
    });
    expect(result.data).toEqual(metrics);
    expect(result.pagination).toEqual({ page: 1, items: 10, hasMore: false });
  });

  it('should resolve owners and teams when provided', async () => {
    mockClient.resolveUsers.mockResolvedValue([{ id: 42 }]);
    mockClient.resolveTeams.mockResolvedValue([{ id: 99 }]);
    mockClient.listMetrics.mockResolvedValue([]);

    await listMetrics(mockClient, {
      items: 10,
      page: 1,
      owners: 'alice@test.com',
      teams: 'team-alpha',
    });

    expect(mockClient.listMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ owners: '42', teams: '99' })
    );
  });

  it('should detect hasMore when data fills page', async () => {
    mockClient.listMetrics.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: i })));

    const result = await listMetrics(mockClient, { items: 10, page: 1 });

    expect(result.pagination!.hasMore).toBe(true);
  });
});

describe('getMetric', () => {
  it('should get metric by id', async () => {
    const metric = { id: 5, name: 'CTR' };
    mockClient.getMetric.mockResolvedValue(metric);

    const result = await getMetric(mockClient, { id: 5 as any });

    expect(mockClient.getMetric).toHaveBeenCalledWith(5);
    expect(result.data).toBeDefined();
  });
});

describe('createMetric', () => {
  it('should create with required fields', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 10 });

    const result = await createMetric(mockClient, {
      name: 'CTR',
      type: 'goal_count',
      description: 'Click-through rate',
      goalId: 1,
    });

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'CTR',
        type: 'goal_count',
        description: 'Click-through rate',
      })
    );
    expect(result).toEqual({ data: { id: 10 } });
  });

  it('should include optional fields', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 11 });

    await createMetric(mockClient, {
      name: 'Rev',
      type: 'goal_property',
      description: 'Revenue',
      goalId: 3,
      owner: 7,
      valueSourceProperty: 'amount',
    });

    expect(mockClient.createMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_id: 3,
        owners: [{ user_id: 7 }],
        value_source_property: 'amount',
      })
    );
  });

  it('should map goal_ratio and related fields to snake_case', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 12 });

    await createMetric(mockClient, {
      name: 'Conversion Rate',
      type: 'goal_ratio',
      description: 'Purchases per visit',
      numeratorType: 'goal_property',
      denominatorType: 'goal_count',
      denominatorOutlierLimitMethod: 'unlimited',
      goalId: 1,
      denominatorGoalId: 2,
      valueSourceProperty: 'amount',
      propertyFilter: { currency: 'USD' },
      denominatorValueSourceProperty: 'count',
      denominatorPropertyFilter: { kind: 'paid' },
      retentionTime: '7d',
      retentionTimeReference: 'first_exposure',
      activityInterval: '1d',
      customSql: 'SELECT 1',
      customStatisticsType: 'continuous',
      vrLookbackInterval: '2w',
      relationKind: 'refund',
      relationRefundOperation: 'subtract',
      relationForeignDuplicateOperation: 'first',
      denominatorRetentionTime: '14d',
      denominatorRetentionTimeReference: 'first_achievement',
      denominatorActivityInterval: '7d',
      denominatorCustomSql: 'SELECT 2',
      denominatorCustomStatisticsType: 'binomial',
      denominatorVrLookbackInterval: '3w',
      denominatorRelationKind: 'replacement',
      denominatorRelationRefundOperation: 'add',
      denominatorRelationForeignDuplicateOperation: 'last',
      ratioCondition: 'require_denominator',
    });

    const payload = mockClient.createMetric.mock.calls[0][0];
    expect(payload).toMatchObject({
      type: 'goal_ratio',
      numerator_type: 'goal_property',
      denominator_type: 'goal_count',
      denominator_outlier_limit_method: 'unlimited',
      goal_id: 1,
      denominator_goal_id: 2,
      value_source_property: 'amount',
      property_filter: { currency: 'USD' },
      denominator_value_source_property: 'count',
      denominator_property_filter: { kind: 'paid' },
      retention_time: '7d',
      retention_time_reference: 'first_exposure',
      activity_interval: '1d',
      custom_sql: 'SELECT 1',
      custom_statistics_type: 'continuous',
      vr_lookback_interval: '2w',
      relation_kind: 'refund',
      relation_refund_operation: 'subtract',
      relation_foreign_duplicate_operation: 'first',
      denominator_retention_time: '14d',
      denominator_retention_time_reference: 'first_achievement',
      denominator_activity_interval: '7d',
      denominator_custom_sql: 'SELECT 2',
      denominator_custom_statistics_type: 'binomial',
      denominator_vr_lookback_interval: '3w',
      denominator_relation_kind: 'replacement',
      denominator_relation_refund_operation: 'add',
      denominator_relation_foreign_duplicate_operation: 'last',
      ratio_condition: 'require_denominator',
    });
  });

  it('should default denominator_value_source_property to empty string for goal_ratio', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 13 });

    await createMetric(mockClient, {
      name: 'Conversion Rate',
      type: 'goal_ratio',
      description: 'Purchases per visit',
      numeratorType: 'goal_property',
      denominatorType: 'goal_count',
      denominatorOutlierLimitMethod: 'unlimited',
      goalId: 1,
      denominatorGoalId: 2,
      valueSourceProperty: 'amount',
    });

    const payload = mockClient.createMetric.mock.calls[0][0];
    expect(payload.denominator_value_source_property).toBe('');
  });

  it('should preserve an explicit denominator_value_source_property for goal_ratio', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 14 });

    await createMetric(mockClient, {
      name: 'Revenue Ratio',
      type: 'goal_ratio',
      description: 'Rev / visits',
      numeratorType: 'goal_property',
      denominatorType: 'goal_property',
      denominatorOutlierLimitMethod: 'unlimited',
      goalId: 1,
      denominatorGoalId: 2,
      valueSourceProperty: 'amount',
      denominatorValueSourceProperty: 'visits',
    });

    const payload = mockClient.createMetric.mock.calls[0][0];
    expect(payload.denominator_value_source_property).toBe('visits');
  });

  it('should not add denominator_value_source_property on non-goal_ratio types', async () => {
    mockClient.createMetric.mockResolvedValue({ id: 15 });

    await createMetric(mockClient, {
      name: 'CTR',
      type: 'goal_count',
      description: 'Count',
      goalId: 1,
    });

    const payload = mockClient.createMetric.mock.calls[0][0];
    expect('denominator_value_source_property' in payload).toBe(false);
  });
});

describe('updateMetric', () => {
  it('should update description', async () => {
    mockClient.updateMetric.mockResolvedValue(undefined);

    const result = await updateMetric(mockClient, { id: 5 as any, description: 'new' });

    expect(mockClient.updateMetric).toHaveBeenCalledWith(5, { description: 'new' });
    expect(result).toEqual({ data: undefined });
  });

  it('should update name', async () => {
    mockClient.updateMetric.mockResolvedValue(undefined);

    await updateMetric(mockClient, { id: 5 as any, name: 'new-name' });

    expect(mockClient.updateMetric).toHaveBeenCalledWith(5, { name: 'new-name' });
  });

  it('should update owner as a single-element owners array', async () => {
    mockClient.updateMetric.mockResolvedValue(undefined);

    await updateMetric(mockClient, { id: 5 as any, owner: 42 });

    expect(mockClient.updateMetric).toHaveBeenCalledWith(5, { owners: [{ user_id: 42 }] });
  });

  it('should combine name, description, and owner in one payload', async () => {
    mockClient.updateMetric.mockResolvedValue(undefined);

    await updateMetric(mockClient, {
      id: 5 as any,
      name: 'n',
      description: 'd',
      owner: 7,
    });

    expect(mockClient.updateMetric).toHaveBeenCalledWith(5, {
      name: 'n',
      description: 'd',
      owners: [{ user_id: 7 }],
    });
  });

  it('should throw when no fields', async () => {
    await expect(updateMetric(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field is required'
    );
  });
});

describe('createMetricVersion', () => {
  it('should POST only the fields the caller provides', async () => {
    mockClient.createMetricVersion.mockResolvedValue({ id: 200, version: 3 });

    const result = await createMetricVersion(mockClient, {
      id: 5 as any,
      reason: 'switch outlier method',
      outlierLimitMethod: 'tukey',
    });

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      5,
      { outlier_limit_method: 'tukey' },
      'switch outlier method'
    );
    expect(result).toEqual({ data: { id: 200, version: 3 } });
  });

  it('should omit undefined fields from the payload', async () => {
    mockClient.createMetricVersion.mockResolvedValue({ id: 201 });

    await createMetricVersion(mockClient, {
      id: 5 as any,
      reason: 'rename',
      name: 'ctr v2',
    });

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(5, { name: 'ctr v2' }, 'rename');
  });

  it('should map camelCase params to snake_case API fields', async () => {
    mockClient.createMetricVersion.mockResolvedValue({ id: 202 });

    await createMetricVersion(mockClient, {
      id: 5 as any,
      reason: 'reshape',
      type: 'goal_property',
      effect: 'negative',
      goalId: 9,
      owner: 11,
      formatStr: '{}',
      scale: 1,
      precision: 2,
      meanFormatStr: '{}%',
      meanScale: 100,
      meanPrecision: 2,
      outlierLimitMethod: 'percentile',
      valueSourceProperty: 'amount',
    });

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(
      5,
      {
        type: 'goal_property',
        effect: 'negative',
        goal_id: 9,
        owners: [{ user_id: 11 }],
        format_str: '{}',
        scale: 1,
        precision: 2,
        mean_format_str: '{}%',
        mean_scale: 100,
        mean_precision: 2,
        outlier_limit_method: 'percentile',
        value_source_property: 'amount',
      },
      'reshape'
    );
  });

  it('should allow an empty-data new version (all fields inherited)', async () => {
    mockClient.createMetricVersion.mockResolvedValue({ id: 203 });

    await createMetricVersion(mockClient, { id: 5 as any, reason: 'bump' });

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(5, {}, 'bump');
  });

  it('should forward undefined reason when caller omits it', async () => {
    mockClient.createMetricVersion.mockResolvedValue({ id: 204 });

    await createMetricVersion(mockClient, { id: 5 as any, name: 'n' });

    expect(mockClient.createMetricVersion).toHaveBeenCalledWith(5, { name: 'n' }, undefined);
  });
});

describe('archiveMetric', () => {
  it('should archive a metric', async () => {
    mockClient.archiveMetric.mockResolvedValue(undefined);

    const result = await archiveMetric(mockClient, { id: 5 as any });

    expect(mockClient.archiveMetric).toHaveBeenCalledWith(5, undefined);
    expect(result).toEqual({ data: undefined });
  });

  it('should unarchive a metric', async () => {
    mockClient.archiveMetric.mockResolvedValue(undefined);

    const result = await archiveMetric(mockClient, { id: 5 as any, unarchive: true });

    expect(mockClient.archiveMetric).toHaveBeenCalledWith(5, true);
    expect(result).toEqual({ data: undefined });
  });
});

describe('activateMetric', () => {
  it('should activate a metric with reason', async () => {
    mockClient.activateMetric.mockResolvedValue(undefined);

    const result = await activateMetric(mockClient, { id: 5 as any, reason: 'ready' });

    expect(mockClient.activateMetric).toHaveBeenCalledWith(5, 'ready');
    expect(result).toEqual({ data: undefined });
  });
});

describe('followMetric', () => {
  it('should follow a metric', async () => {
    mockClient.followMetric.mockResolvedValue(undefined);

    const result = await followMetric(mockClient, { id: 5 as any });

    expect(mockClient.followMetric).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});

describe('unfollowMetric', () => {
  it('should unfollow a metric', async () => {
    mockClient.unfollowMetric.mockResolvedValue(undefined);

    const result = await unfollowMetric(mockClient, { id: 5 as any });

    expect(mockClient.unfollowMetric).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});

describe('listMetricAccessUsers', () => {
  it('should list access users', async () => {
    const users = [{ userId: 1 }];
    mockClient.listMetricAccessUsers.mockResolvedValue(users);

    const result = await listMetricAccessUsers(mockClient, { id: 5 as any });

    expect(mockClient.listMetricAccessUsers).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: users });
  });
});

describe('grantMetricAccessUser', () => {
  it('should grant user access', async () => {
    mockClient.grantMetricAccessUser.mockResolvedValue(undefined);

    const result = await grantMetricAccessUser(mockClient, {
      id: 5 as any,
      userId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.grantMetricAccessUser).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('revokeMetricAccessUser', () => {
  it('should revoke user access', async () => {
    mockClient.revokeMetricAccessUser.mockResolvedValue(undefined);

    const result = await revokeMetricAccessUser(mockClient, {
      id: 5 as any,
      userId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.revokeMetricAccessUser).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('listMetricAccessTeams', () => {
  it('should list access teams', async () => {
    const teams = [{ teamId: 1 }];
    mockClient.listMetricAccessTeams.mockResolvedValue(teams);

    const result = await listMetricAccessTeams(mockClient, { id: 5 as any });

    expect(mockClient.listMetricAccessTeams).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: teams });
  });
});

describe('grantMetricAccessTeam', () => {
  it('should grant team access', async () => {
    mockClient.grantMetricAccessTeam.mockResolvedValue(undefined);

    const result = await grantMetricAccessTeam(mockClient, {
      id: 5 as any,
      teamId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.grantMetricAccessTeam).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('revokeMetricAccessTeam', () => {
  it('should revoke team access', async () => {
    mockClient.revokeMetricAccessTeam.mockResolvedValue(undefined);

    const result = await revokeMetricAccessTeam(mockClient, {
      id: 5 as any,
      teamId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.revokeMetricAccessTeam).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('getMetricReview', () => {
  it('should get review', async () => {
    const review = { status: 'pending' };
    mockClient.getMetricReview.mockResolvedValue(review);

    const result = await getMetricReview(mockClient, { id: 5 as any });

    expect(mockClient.getMetricReview).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: review });
  });
});

describe('requestMetricReview', () => {
  it('should request review', async () => {
    mockClient.requestMetricReview.mockResolvedValue(undefined);

    const result = await requestMetricReview(mockClient, { id: 5 as any });

    expect(mockClient.requestMetricReview).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});

describe('approveMetricReview', () => {
  it('should approve review', async () => {
    mockClient.approveMetricReview.mockResolvedValue(undefined);

    const result = await approveMetricReview(mockClient, { id: 5 as any });

    expect(mockClient.approveMetricReview).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});

describe('listMetricReviewComments', () => {
  it('should list comments', async () => {
    const comments = [{ id: 1, message: 'hi' }];
    mockClient.listMetricReviewComments.mockResolvedValue(comments);

    const result = await listMetricReviewComments(mockClient, { id: 5 as any });

    expect(mockClient.listMetricReviewComments).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: comments });
  });
});

describe('addMetricReviewComment', () => {
  it('should add comment', async () => {
    mockClient.addMetricReviewComment.mockResolvedValue(undefined);

    const result = await addMetricReviewComment(mockClient, { id: 5 as any, message: 'LGTM' });

    expect(mockClient.addMetricReviewComment).toHaveBeenCalledWith(5, 'LGTM');
    expect(result).toEqual({ data: undefined });
  });
});

describe('replyToMetricReviewComment', () => {
  it('should reply to comment', async () => {
    mockClient.replyToMetricReviewComment.mockResolvedValue(undefined);

    const result = await replyToMetricReviewComment(mockClient, {
      id: 5 as any,
      commentId: 10,
      message: 'Thanks!',
    });

    expect(mockClient.replyToMetricReviewComment).toHaveBeenCalledWith(5, 10, 'Thanks!');
    expect(result).toEqual({ data: undefined });
  });
});

describe('validateMetricFields', () => {
  it('strict mode rejects unknown --type', () => {
    expect(() =>
      validateMetricFields({ name: 'x', type: 'ratio', description: 'd' }, { mode: 'strict' })
    ).toThrow(/Unknown metric --type 'ratio'/);
  });

  it('strict mode requires --goal for goal_count', () => {
    expect(() =>
      validateMetricFields({ name: 'x', type: 'goal_count', description: 'd' }, { mode: 'strict' })
    ).toThrow(/--goal is required when --type is goal_count/);
  });

  it('strict mode requires value_source_property and goal_id for goal_property', () => {
    try {
      validateMetricFields(
        { name: 'x', type: 'goal_property', description: 'd' },
        { mode: 'strict' }
      );
      throw new Error('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/--value-source-property/);
      expect(msg).toMatch(/--goal/);
    }
  });

  it('strict mode requires numerator_type, denominator_type, denominator_outlier_limit_method for goal_ratio', () => {
    try {
      validateMetricFields({ name: 'x', type: 'goal_ratio', description: 'd' }, { mode: 'strict' });
      throw new Error('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/--numerator-type/);
      expect(msg).toMatch(/--denominator-type/);
      expect(msg).toMatch(/--denominator-outlier-limit-method/);
    }
  });

  it('strict mode requires denominator goal id for goal_ratio with goal_count denominator', () => {
    expect(() =>
      validateMetricFields(
        {
          name: 'x',
          type: 'goal_ratio',
          description: 'd',
          numeratorType: 'goal_count',
          denominatorType: 'goal_count',
          denominatorOutlierLimitMethod: 'unlimited',
          goalId: 1,
        },
        { mode: 'strict' }
      )
    ).toThrow(/--denominator-goal is required when --denominator-type is goal_count/);
  });

  it('strict mode requires denominator_value_source_property for goal_property denominator', () => {
    try {
      validateMetricFields(
        {
          name: 'x',
          type: 'goal_ratio',
          description: 'd',
          numeratorType: 'goal_count',
          denominatorType: 'goal_property',
          denominatorOutlierLimitMethod: 'unlimited',
          goalId: 1,
          denominatorGoalId: 2,
        },
        { mode: 'strict' }
      );
      throw new Error('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/--denominator-value-source-property/);
    }
  });

  it('strict mode passes a fully-specified goal_ratio with goal_property numerator and goal_count denominator', () => {
    expect(() =>
      validateMetricFields(
        {
          name: 'x',
          type: 'goal_ratio',
          description: 'd',
          numeratorType: 'goal_property',
          denominatorType: 'goal_count',
          denominatorOutlierLimitMethod: 'unlimited',
          goalId: 1,
          denominatorGoalId: 2,
          valueSourceProperty: 'amount',
        },
        { mode: 'strict' }
      )
    ).not.toThrow();
  });

  it('loose mode skips validation when no type/numerator/denominator is being set', () => {
    expect(() =>
      validateMetricFields({ name: 'renamed', description: 'still d' }, { mode: 'loose' })
    ).not.toThrow();
  });

  it('loose mode validates when numerator_type is set', () => {
    expect(() =>
      validateMetricFields({ numeratorType: 'goal_property' }, { mode: 'loose' })
    ).toThrow(/--value-source-property is required when --numerator-type is goal_property/);
  });

  it('loose mode validates when denominator_type is set', () => {
    expect(() =>
      validateMetricFields({ denominatorType: 'goal_count' }, { mode: 'loose' })
    ).toThrow(/--denominator-goal is required when --denominator-type is goal_count/);
  });

  it('rejects empty strings the same as undefined', () => {
    expect(() =>
      validateMetricFields(
        {
          name: 'x',
          type: 'goal_property',
          description: 'd',
          goalId: 1,
          valueSourceProperty: '',
        },
        { mode: 'strict' }
      )
    ).toThrow(/--value-source-property is required/);
  });
});

describe('listMetrics rows', () => {
  it('should include summarized rows', async () => {
    const metrics = [
      { id: 1, name: 'M1', type: 'conversion', lifecycle_status: 'active', goal_id: 5 },
      { id: 2, name: 'M2', type: 'revenue', lifecycle_status: 'draft', goal: { name: 'Goal B' } },
    ];
    mockClient.listMetrics.mockResolvedValue(metrics);

    const result = await listMetrics(mockClient, { items: 10, page: 1 });

    expect(result.rows).toEqual([
      {
        id: 1,
        name: 'M1',
        type: 'conversion',
        effect: '',
        status: 'active',
        goal: 5,
        category: '',
      },
      {
        id: 2,
        name: 'M2',
        type: 'revenue',
        effect: '',
        status: 'draft',
        goal: 'Goal B',
        category: '',
      },
    ]);
    expect(result.data).toEqual(metrics);
  });
});

describe('getMetric summarization', () => {
  const metric = {
    id: 5,
    name: 'Signup Rate',
    type: 'conversion',
    lifecycle_status: 'active',
    definition: { some: 'large blob' },
  };

  it('returns summarized data by default', async () => {
    mockClient.getMetric.mockResolvedValue(metric);
    const result = await getMetric(mockClient, { id: 5 as any });
    expect(result.data).not.toHaveProperty('definition');
    expect(result.data).toMatchObject({ id: 5, name: 'Signup Rate', type: 'conversion' });
  });

  it('returns raw data when raw=true', async () => {
    mockClient.getMetric.mockResolvedValue(metric);
    const result = await getMetric(mockClient, { id: 5 as any, raw: true });
    expect(result.data).toEqual(metric);
  });

  it('includes an extra field via show', async () => {
    mockClient.getMetric.mockResolvedValue(metric);
    const result = await getMetric(mockClient, { id: 5 as any, show: ['definition'] });
    expect(result.data).toHaveProperty('definition', { some: 'large blob' });
  });
});

describe('listAllMetrics', () => {
  it('pages through results until a short page is returned', async () => {
    const client = {
      listMetrics: vi.fn(),
    } as any;
    // pageSize 2: page1 full (2), page2 full (2), page3 short (1) -> stop
    client.listMetrics
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 3 }, { id: 4 }])
      .mockResolvedValueOnce([{ id: 5 }]);

    const result = await listAllMetrics(client, { items: 100, page: 1 }, 2);

    expect(result.data.map((m: any) => m.id)).toEqual([1, 2, 3, 4, 5]);
    expect(client.listMetrics).toHaveBeenCalledTimes(3);
    expect(client.listMetrics).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ items: 2, page: 1 })
    );
    expect(client.listMetrics).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ items: 2, page: 3 })
    );
  });

  it('stops after a single page when fewer than pageSize are returned', async () => {
    const client = { listMetrics: vi.fn().mockResolvedValue([{ id: 1 }]) } as any;
    const result = await listAllMetrics(client, { items: 100, page: 1 }, 2);
    expect(result.data).toHaveLength(1);
    expect(client.listMetrics).toHaveBeenCalledTimes(1);
  });

  it('resolves owners and teams once, then forwards their IDs on every page', async () => {
    const client = {
      listMetrics: vi.fn().mockResolvedValue([]),
      resolveUsers: vi.fn().mockResolvedValue([{ id: 10, email: 'jane@example.com' }]),
      resolveTeams: vi.fn().mockResolvedValue([{ id: 5, name: 'Growth' }]),
    } as any;

    await listAllMetrics(
      client,
      { items: 100, page: 1, owners: 'jane@example.com', teams: 'Growth' },
      2
    );

    expect(client.resolveUsers).toHaveBeenCalledTimes(1);
    expect(client.resolveTeams).toHaveBeenCalledTimes(1);
    expect(client.listMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ owners: '10', teams: '5' })
    );
  });

  it('warns and reports hasMore when the page cap is reached (truncation)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Every page is full (pageSize 2), so the loop never breaks early and hits the cap.
    const client = { listMetrics: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) } as any;

    const result = await listAllMetrics(client, { items: 100, page: 1 }, 2, 3);

    expect(client.listMetrics).toHaveBeenCalledTimes(3); // maxPages
    expect(result.data).toHaveLength(6);
    expect(result.pagination?.hasMore).toBe(true);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('fetch cap'));
    errSpy.mockRestore();
  });

  it('does not warn and reports hasMore false when a short page ends the fetch', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = {
      listMetrics: vi
        .fn()
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
        .mockResolvedValueOnce([{ id: 3 }]),
    } as any;

    const result = await listAllMetrics(client, { items: 100, page: 1 }, 2, 3);

    expect(result.pagination?.hasMore).toBe(false);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
