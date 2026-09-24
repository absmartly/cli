import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listGoals } from './list.js';
import { getGoal } from './get.js';
import { createGoal } from './create.js';
import { updateGoal } from './update.js';
import {
  listGoalAccessUsers,
  grantGoalAccessUser,
  revokeGoalAccessUser,
  listGoalAccessTeams,
  grantGoalAccessTeam,
  revokeGoalAccessTeam,
} from './access.js';
import { followGoal, unfollowGoal } from './follow.js';

const mockClient = {
  listGoals: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  listGoalAccessUsers: vi.fn(),
  grantGoalAccessUser: vi.fn(),
  revokeGoalAccessUser: vi.fn(),
  listGoalAccessTeams: vi.fn(),
  grantGoalAccessTeam: vi.fn(),
  revokeGoalAccessTeam: vi.fn(),
  followGoal: vi.fn(),
  unfollowGoal: vi.fn(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('listGoals', () => {
  it('should list goals with pagination', async () => {
    const goals = [{ id: 1 }, { id: 2 }];
    mockClient.listGoals.mockResolvedValue(goals);

    const result = await listGoals(mockClient, { items: 10, page: 1 });

    expect(mockClient.listGoals).toHaveBeenCalledWith({ items: 10, page: 1 });
    expect(result.data).toEqual(goals);
    expect(result.pagination).toEqual({ page: 1, items: 10, hasMore: false });
  });

  it('should detect hasMore when data fills page', async () => {
    const goals = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    mockClient.listGoals.mockResolvedValue(goals);

    const result = await listGoals(mockClient, { items: 10, page: 1 });

    expect(result.pagination!.hasMore).toBe(true);
  });

  it('should include summarized rows', async () => {
    const goals = [
      { id: 1, name: 'G1', archived: false, tags: [{ goal_tag: { tag: 'core' } }] },
      { id: 2, name: 'G2', archived: true, tags: [] },
    ];
    mockClient.listGoals.mockResolvedValue(goals);

    const result = await listGoals(mockClient, { items: 10, page: 1 });

    expect(result.rows).toEqual([
      { id: 1, name: 'G1', tags: 'core', archived: false },
      { id: 2, name: 'G2', tags: '', archived: true },
    ]);
  });
});

describe('getGoal', () => {
  it('should get goal by id', async () => {
    const goal = { id: 5, name: 'Goal' };
    mockClient.getGoal.mockResolvedValue(goal);

    const result = await getGoal(mockClient, { id: 5 as any });

    expect(mockClient.getGoal).toHaveBeenCalledWith(5);
    expect(result.data).toMatchObject({ id: 5, name: 'Goal' });
  });

  it('should summarize by default and honor raw', async () => {
    const goal = { id: 5, name: 'Goal', archived: false, big_field: 'lots of data' };
    mockClient.getGoal.mockResolvedValue(goal);

    const summarized = await getGoal(mockClient, { id: 5 as any });
    expect(summarized.data).not.toHaveProperty('big_field');
    expect(summarized.data).toMatchObject({ id: 5, name: 'Goal' });

    const raw = await getGoal(mockClient, { id: 5 as any, raw: true });
    expect(raw.data).toEqual(goal);
  });
});

describe('createGoal', () => {
  it('should create with name only', async () => {
    mockClient.createGoal.mockResolvedValue({ id: 10 });

    const result = await createGoal(mockClient, { name: 'New Goal' });

    expect(mockClient.createGoal).toHaveBeenCalledWith({ name: 'New Goal' });
    expect(result).toEqual({ data: { id: 10 } });
  });

  it('should include description', async () => {
    mockClient.createGoal.mockResolvedValue({ id: 11 });

    await createGoal(mockClient, { name: 'G', description: 'desc' });

    expect(mockClient.createGoal).toHaveBeenCalledWith({ name: 'G', description: 'desc' });
  });
});

describe('updateGoal', () => {
  it('should update description', async () => {
    mockClient.updateGoal.mockResolvedValue(undefined);

    const result = await updateGoal(mockClient, { id: 5 as any, description: 'new desc' });

    expect(mockClient.updateGoal).toHaveBeenCalledWith(5, { description: 'new desc' });
    expect(result).toEqual({ data: undefined });
  });

  it('should throw when no fields provided', async () => {
    await expect(updateGoal(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field is required'
    );
  });
});

describe('listGoalAccessUsers', () => {
  it('should list access users', async () => {
    const users = [{ userId: 1 }];
    mockClient.listGoalAccessUsers.mockResolvedValue(users);

    const result = await listGoalAccessUsers(mockClient, { id: 5 as any });

    expect(mockClient.listGoalAccessUsers).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: users });
  });
});

describe('grantGoalAccessUser', () => {
  it('should grant user access', async () => {
    mockClient.grantGoalAccessUser.mockResolvedValue(undefined);

    const result = await grantGoalAccessUser(mockClient, {
      id: 5 as any,
      userId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.grantGoalAccessUser).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('revokeGoalAccessUser', () => {
  it('should revoke user access', async () => {
    mockClient.revokeGoalAccessUser.mockResolvedValue(undefined);

    const result = await revokeGoalAccessUser(mockClient, {
      id: 5 as any,
      userId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.revokeGoalAccessUser).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('listGoalAccessTeams', () => {
  it('should list access teams', async () => {
    const teams = [{ teamId: 1 }];
    mockClient.listGoalAccessTeams.mockResolvedValue(teams);

    const result = await listGoalAccessTeams(mockClient, { id: 5 as any });

    expect(mockClient.listGoalAccessTeams).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: teams });
  });
});

describe('grantGoalAccessTeam', () => {
  it('should grant team access', async () => {
    mockClient.grantGoalAccessTeam.mockResolvedValue(undefined);

    const result = await grantGoalAccessTeam(mockClient, {
      id: 5 as any,
      teamId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.grantGoalAccessTeam).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('revokeGoalAccessTeam', () => {
  it('should revoke team access', async () => {
    mockClient.revokeGoalAccessTeam.mockResolvedValue(undefined);

    const result = await revokeGoalAccessTeam(mockClient, {
      id: 5 as any,
      teamId: 10 as any,
      roleId: 20 as any,
    });

    expect(mockClient.revokeGoalAccessTeam).toHaveBeenCalledWith(5, 10, 20);
    expect(result).toEqual({ data: undefined });
  });
});

describe('followGoal', () => {
  it('should follow a goal', async () => {
    mockClient.followGoal.mockResolvedValue(undefined);

    const result = await followGoal(mockClient, { id: 5 as any });

    expect(mockClient.followGoal).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});

describe('unfollowGoal', () => {
  it('should unfollow a goal', async () => {
    mockClient.unfollowGoal.mockResolvedValue(undefined);

    const result = await unfollowGoal(mockClient, { id: 5 as any });

    expect(mockClient.unfollowGoal).toHaveBeenCalledWith(5);
    expect(result).toEqual({ data: undefined });
  });
});
