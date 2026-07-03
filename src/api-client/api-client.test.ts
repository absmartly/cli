import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/mocks/server.js';
import { createAPIClient } from '../lib/api/client.js';
import { isLiveMode, TEST_BASE_URL, TEST_API_KEY } from '../test/helpers/test-config.js';

const BASE_URL = TEST_BASE_URL;

describe.skipIf(isLiveMode)('APIClient core', () => {
  const client = createAPIClient(BASE_URL, TEST_API_KEY);

  afterEach(() => {
    server.resetHandlers();
  });

  describe('error status handling', () => {
    it('should throw with 401 unauthorized message', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () => new HttpResponse(null, { status: 401 }))
      );
      await expect(client.listExperiments()).rejects.toThrow(/Unauthorized/);
    });

    it('should throw with 403 forbidden message', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () => new HttpResponse(null, { status: 403 }))
      );
      await expect(client.listExperiments()).rejects.toThrow(/Forbidden/);
    });

    it('should throw with 404 not found message', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/999`, () => new HttpResponse(null, { status: 404 }))
      );
      await expect(client.getExperiment(999)).rejects.toThrow(/Not found/);
    });

    it('should throw with 429 rate limit message', async () => {
      server.use(
        http.get(
          `${BASE_URL}/experiments`,
          () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '30' } })
        )
      );
      await expect(client.listExperiments()).rejects.toThrow(/Rate limit/);
    });

    it('should throw generic error for 500', async () => {
      server.use(http.get(`${BASE_URL}/roles`, () => new HttpResponse(null, { status: 500 })));
      await expect(client.listRoles()).rejects.toThrow(/API error/);
    });

    it('should surface a 500 body message field', async () => {
      server.use(
        http.post(`${BASE_URL}/metrics/1/version`, () =>
          HttpResponse.json({ message: 'Invalid prisma.metric.create()' }, { status: 500 })
        )
      );
      await expect(client.createMetricVersion(1, {}, 'r')).rejects.toThrow(
        /Invalid prisma\.metric\.create/
      );
    });

    it('should add a hint on chk_goal_ratio constraint errors', async () => {
      server.use(
        http.post(`${BASE_URL}/metrics/1/version`, () =>
          HttpResponse.json(
            {
              message: 'new row for relation "metrics" violates check constraint "chk_goal_ratio"',
            },
            { status: 500 }
          )
        )
      );
      await expect(client.createMetricVersion(1, {}, 'r')).rejects.toThrow(
        /Hint: goal_ratio needs consistent/
      );
    });

    it('should parse a Prisma 500 body into clean message/detail lines', async () => {
      const prismaBody =
        'Invalid `prisma.metric.create()` invocation:\n\n\n' +
        'Error occurred during query execution:\n' +
        'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(' +
        'PostgresError { code: "23514", message: "new row for relation \\"metrics\\" violates check constraint \\"chk_goal_ratio\\"", ' +
        'severity: "ERROR", detail: Some("Failing row contains (394, 92, ...)."), ' +
        'column: None, hint: None }), transient: false })';
      server.use(
        http.post(`${BASE_URL}/metrics/1/version`, () =>
          HttpResponse.json({ message: prismaBody }, { status: 500 })
        )
      );
      let caught: Error | undefined;
      try {
        await client.createMetricVersion(1, {}, 'r');
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeDefined();
      const msg = caught!.message;
      expect(msg).toContain(
        'new row for relation "metrics" violates check constraint "chk_goal_ratio"'
      );
      expect(msg).toContain('Failing row contains (394, 92, ...).');
      // The original noisy wrapper should be gone:
      expect(msg).not.toContain('ConnectorError(');
      expect(msg).not.toContain('PostgresError {');
      // And we should not have prefixed the extracted parts:
      expect(msg).not.toMatch(/^\s*message:\s/m);
      expect(msg).not.toMatch(/^\s*detail:\s/m);
    });
  });

  describe('validateListResponse', () => {
    it('should throw when response is not an object', async () => {
      server.use(http.get(`${BASE_URL}/goals`, () => HttpResponse.json('not-an-object')));
      await expect(client.listGoals()).rejects.toThrow(/Expected object/);
    });

    it('should throw when expected key is missing', async () => {
      server.use(http.get(`${BASE_URL}/goals`, () => HttpResponse.json({ wrong_key: [] })));
      await expect(client.listGoals()).rejects.toThrow(/Missing "goals" field/);
    });

    it('should throw when expected key is not an array', async () => {
      server.use(http.get(`${BASE_URL}/goals`, () => HttpResponse.json({ goals: 'not-array' })));
      await expect(client.listGoals()).rejects.toThrow(/must be an array/);
    });
  });

  describe('validateEntityResponse', () => {
    it('should throw when response is not an object', async () => {
      server.use(http.get(`${BASE_URL}/goals/1`, () => HttpResponse.json('not-an-object')));
      await expect(client.getGoal(1)).rejects.toThrow(/Expected object/);
    });

    it('should throw when expected key is missing', async () => {
      server.use(http.get(`${BASE_URL}/goals/1`, () => HttpResponse.json({ wrong_key: {} })));
      await expect(client.getGoal(1)).rejects.toThrow(/Missing "goal" field/);
    });
  });

  describe('validateOkResponse', () => {
    it('should throw when ok is false with errors', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/export_data`, () =>
          HttpResponse.json({ ok: false, errors: ['denied'] })
        )
      );
      await expect(client.exportExperimentData(1)).rejects.toThrow(/denied/);
    });

    it('should succeed and return export_config when ok is true', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/export_data`, () =>
          HttpResponse.json({
            ok: true,
            errors: [],
            exportConfig: { id: 99, experiment_id: 1 },
          })
        )
      );
      const result = await client.exportExperimentData(1);
      expect(result).toEqual({ id: 99, experiment_id: 1 });
    });
  });

  describe('experiments CRUD', () => {
    it('should list experiments with filters', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          return HttpResponse.json({
            experiments: [{ id: 1, name: 'test', state: params.get('state') }],
          });
        })
      );
      const result = await client.listExperiments({ state: 'running', items: 10 });
      expect(result[0].state).toBe('running');
    });

    it('should get experiment by ID', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/42`, () =>
          HttpResponse.json({ experiment: { id: 42, name: 'test' } })
        )
      );
      const result = await client.getExperiment(42);
      expect(result.id).toBe(42);
    });

    it('should create experiment', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({ ok: true, experiment: { id: 1, name: 'new' }, errors: [] })
        )
      );
      const result = await client.createExperiment({ name: 'new' } as any);
      expect(result.id).toBe(1);
    });

    it('should start experiment', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/start`, () =>
          HttpResponse.json({ experiment: { id: 1, name: 'test', state: 'running' } })
        )
      );
      const result = await client.startExperiment(1);
      expect(result.state).toBe('running');
    });

    it('should stop experiment with reason', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/stop`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            experiment: { id: 1, name: 'test', state: 'stopped', reason: body.reason },
          });
        })
      );
      const result = await client.stopExperiment(1, 'complete');
      expect(result.state).toBe('stopped');
    });

    it('should archive experiment', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/archive`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.archive).toBe(true);
          return HttpResponse.json({ ok: true });
        })
      );
      await client.archiveExperiment(1);
    });

    it('should unarchive experiment', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/archive`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          expect(body.archive).toBe(false);
          return HttpResponse.json({ ok: true });
        })
      );
      await client.archiveExperiment(1, true);
    });

    it('should get parent experiment', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1/parent`, () =>
          HttpResponse.json({ parent_experiment: { id: 2, name: 'parent' } })
        )
      );
      const result = await client.getParentExperiment(1);
      expect(result.id).toBe(2);
    });

    it('should put experiment to development', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/development`, () =>
          HttpResponse.json({ experiment: { id: 1, name: 'test', state: 'development' } })
        )
      );
      const result = await client.developmentExperiment(1, 'testing');
      expect(result.state).toBe('development');
    });

    it('should full-on experiment', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/full_on`, () =>
          HttpResponse.json({ experiment: { id: 1, name: 'test' } })
        )
      );
      const result = await client.fullOnExperiment(1, 1, 'winner');
      expect(result.id).toBe(1);
    });

    it('should pass date range filters including timestamp 0', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );
      await client.listExperiments({ created_after: 0 });
      expect(receivedParams?.get('created_at')).toBe('0,0');
    });

    it('should pass started_at with only started_before', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );
      await client.listExperiments({ started_before: 1000 });
      expect(receivedParams?.get('started_at')).toBe('0,1000');
    });

    it('should pass stopped_at with timestamp 0 for stopped_after', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE_URL}/experiments`, ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ experiments: [] });
        })
      );
      await client.listExperiments({ stopped_after: 0, stopped_before: 5000 });
      expect(receivedParams?.get('stopped_at')).toBe('0,5000');
    });
  });

  describe('goals CRUD', () => {
    it('should list goals with pagination', async () => {
      server.use(
        http.get(`${BASE_URL}/goals`, () => HttpResponse.json({ goals: [{ id: 1, name: 'g1' }] }))
      );
      const result = await client.listGoals({ items: 50, page: 10 });
      expect(result).toHaveLength(1);
    });

    it('should get goal', async () => {
      server.use(
        http.get(`${BASE_URL}/goals/1`, () => HttpResponse.json({ goal: { id: 1, name: 'g1' } }))
      );
      expect((await client.getGoal(1)).id).toBe(1);
    });

    it('should create goal', async () => {
      server.use(
        http.post(`${BASE_URL}/goals`, () => HttpResponse.json({ goal: { id: 1, name: 'new' } }))
      );
      expect((await client.createGoal({ name: 'new' } as any)).id).toBe(1);
    });

    it('should update goal', async () => {
      server.use(
        http.put(`${BASE_URL}/goals/1`, () =>
          HttpResponse.json({ goal: { id: 1, name: 'updated' } })
        )
      );
      expect((await client.updateGoal(1, { name: 'updated' } as any)).name).toBe('updated');
    });
  });

  describe('segments CRUD', () => {
    it('should list segments', async () => {
      server.use(http.get(`${BASE_URL}/segments`, () => HttpResponse.json({ segments: [] })));
      expect(await client.listSegments()).toEqual([]);
    });

    it('should create segment', async () => {
      server.use(
        http.post(`${BASE_URL}/segments`, () =>
          HttpResponse.json({ segment: { id: 1, name: 's1' } })
        )
      );
      expect((await client.createSegment({ name: 's1' } as any)).id).toBe(1);
    });

    it('should delete segment', async () => {
      server.use(
        http.delete(`${BASE_URL}/segments/1`, () => new HttpResponse(null, { status: 204 }))
      );
      await client.deleteSegment(1);
    });
  });

  describe('teams CRUD', () => {
    it('should list teams with include_archived', async () => {
      server.use(
        http.get(`${BASE_URL}/teams`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          expect(params.get('include_archived')).toBe('1');
          return HttpResponse.json({ teams: [] });
        })
      );
      await client.listTeams({ includeArchived: true });
    });

    it('should create team', async () => {
      server.use(
        http.post(`${BASE_URL}/teams`, () => HttpResponse.json({ team: { id: 1, name: 'Growth' } }))
      );
      expect((await client.createTeam({ name: 'Growth' } as any)).name).toBe('Growth');
    });

    it('should archive team', async () => {
      server.use(http.put(`${BASE_URL}/teams/1/archive`, () => HttpResponse.json({ ok: true })));
      await client.archiveTeam(1);
    });

    it('should list team members', async () => {
      server.use(
        http.get(`${BASE_URL}/teams/1/members`, () =>
          HttpResponse.json({ team_members: [{ id: 1, email: 'a@b.c' }] })
        )
      );
      expect(await client.listTeamMembers(1)).toHaveLength(1);
    });

    it('should add team members', async () => {
      server.use(
        http.put(`${BASE_URL}/teams/1/members/add`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.addTeamMembers(1, [1, 2] as any, [1] as any);
    });

    it('should remove team members', async () => {
      server.use(
        http.put(`${BASE_URL}/teams/1/members/remove`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.removeTeamMembers(1, [1] as any);
    });
  });

  describe('users CRUD', () => {
    it('should list users', async () => {
      server.use(
        http.get(`${BASE_URL}/users`, () =>
          HttpResponse.json({ users: [{ id: 1, email: 'a@b.c' }] })
        )
      );
      expect(await client.listUsers()).toHaveLength(1);
    });

    it('should serialize native list filters as query params', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(`${BASE_URL}/users`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ users: [{ id: 1, email: 'a@b.c' }] });
        })
      );
      await client.listUsers({
        search: 'alice',
        sort: 'email',
        sort_asc: true,
        ids: '1,2,3',
      });
      expect(capturedUrl).toBeDefined();
      const url = new URL(capturedUrl!);
      expect(url.searchParams.get('search')).toBe('alice');
      expect(url.searchParams.get('sort')).toBe('email');
      expect(url.searchParams.get('sort_asc')).toBe('true');
      expect(url.searchParams.get('ids')).toBe('1,2,3');
    });

    it('should send include_archived when includeArchived is true', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(`${BASE_URL}/users`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ users: [] });
        })
      );
      await client.listUsers({ includeArchived: true });
      expect(new URL(capturedUrl!).searchParams.get('include_archived')).toBe('1');
    });

    it('should not send native filter params when omitted', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(`${BASE_URL}/users`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ users: [] });
        })
      );
      await client.listUsers();
      const url = new URL(capturedUrl!);
      expect(url.searchParams.get('sort')).toBeNull();
      expect(url.searchParams.get('sort_asc')).toBeNull();
      expect(url.searchParams.get('ids')).toBeNull();
      expect(url.searchParams.get('search')).toBeNull();
    });

    it('should reset user password', async () => {
      server.use(
        http.put(`${BASE_URL}/users/1/reset-password`, () =>
          HttpResponse.json({ ok: true, password: 'newPass123', errors: [] })
        )
      );
      const result = await client.resetUserPassword(1);
      expect(result).toEqual({ password: 'newPass123' });
    });
  });

  describe('metrics CRUD', () => {
    it('should list metrics', async () => {
      server.use(
        http.get(`${BASE_URL}/metrics`, () =>
          HttpResponse.json({ metrics: [{ id: 1, name: 'm1' }] })
        )
      );
      expect(await client.listMetrics()).toHaveLength(1);
    });

    it('should pass include_drafts param when listing metrics', async () => {
      let capturedUrl: string | undefined;
      server.use(
        http.get(`${BASE_URL}/metrics`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ metrics: [{ id: 1, name: 'm1' }] });
        })
      );
      await client.listMetrics({ include_drafts: true });
      expect(capturedUrl).toContain('include_drafts=true');
    });

    it('should activate metric', async () => {
      server.use(
        http.put(`${BASE_URL}/metrics/1/activate`, () =>
          HttpResponse.json({ metric: { id: 1, name: 'm1' } })
        )
      );
      expect((await client.activateMetric(1, 'review')).id).toBe(1);
    });

    it('should archive metric', async () => {
      server.use(http.put(`${BASE_URL}/metrics/1/archive`, () => HttpResponse.json({ ok: true })));
      await client.archiveMetric(1);
    });

    it('should create metric version with reason in body', async () => {
      let capturedBody: unknown;
      server.use(
        http.post(`${BASE_URL}/metrics/1/version`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ metric: { id: 99, name: 'm1', version: 2 } });
        })
      );
      const result = await client.createMetricVersion(
        1,
        { type: 'goal_unique_count' },
        'switch type'
      );
      expect(result.id).toBe(99);
      expect(capturedBody).toEqual({
        data: { type: 'goal_unique_count' },
        reason: 'switch type',
      });
    });

    it('should create metric version without reason when omitted', async () => {
      let capturedBody: unknown;
      server.use(
        http.post(`${BASE_URL}/metrics/1/version`, async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ metric: { id: 100, name: 'm1', version: 3 } });
        })
      );
      await client.createMetricVersion(1, { name: 'renamed' });
      expect(capturedBody).toEqual({ data: { name: 'renamed' } });
    });
  });

  describe('experiment sub-resources', () => {
    it('should list experiment activity', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1/activity`, () =>
          HttpResponse.json({ experiment_notes: [{ id: 1, note: 'hello' }] })
        )
      );
      expect(await client.listExperimentActivity(1)).toHaveLength(1);
    });

    it('should create experiment note', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/activity`, () =>
          HttpResponse.json({ experiment_note: { id: 1, note: 'new' } })
        )
      );
      expect((await client.createExperimentNote(1, 'new')).note).toBe('new');
    });

    it('should edit experiment note', async () => {
      server.use(
        http.put(`${BASE_URL}/experiments/1/activity/2`, () =>
          HttpResponse.json({ ok: true, experiment_note: { id: 2, note: 'edited' }, errors: [] })
        )
      );
      expect((await client.editExperimentNote(1, 2 as any, 'edited')).note).toBe('edited');
    });

    it('should reply to experiment note', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/activity/2/reply`, () =>
          HttpResponse.json({ ok: true, experiment_note: { id: 3, note: 'reply' }, errors: [] })
        )
      );
      expect((await client.replyToExperimentNote(1, 2 as any, 'reply')).note).toBe('reply');
    });

    it('should list experiment metrics', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1/metrics`, () =>
          HttpResponse.json({ experiment_metrics: [{ metric_id: 1 }] })
        )
      );
      expect(await client.listExperimentMetrics(1)).toHaveLength(1);
    });

    it('should add experiment metrics', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/metrics`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.addExperimentMetrics(1, [1, 2] as any);
    });

    it('should confirm metric impact', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/metrics/2/confirm_impact`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.confirmMetricImpact(1, 2 as any);
    });

    it('should exclude experiment metric', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/metrics/2/exclude`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.excludeExperimentMetric(1, 2 as any);
    });

    it('should include experiment metric', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/metrics/2/include`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.includeExperimentMetric(1, 2 as any);
    });

    it('should export experiment data', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/export_data`, () =>
          HttpResponse.json({
            ok: true,
            errors: [],
            exportConfig: { id: 99, experiment_id: 1 },
          })
        )
      );
      const result = await client.exportExperimentData(1);
      expect(result).toEqual({ id: 99, experiment_id: 1 });
    });

    it('should request experiment update', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/request_update`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.requestExperimentUpdate(1);
    });

    it('should list experiment alerts', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_alerts`, () =>
          HttpResponse.json({ experiment_alerts: [{ id: 1, type: 'srm' }] })
        )
      );
      expect(await client.listExperimentAlerts(1)).toHaveLength(1);
    });

    it('should dismiss alert', async () => {
      server.use(
        http.put(`${BASE_URL}/experiment_alerts/1/dismiss`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.dismissAlert(1 as any);
    });

    it('should list recommended actions', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_recommended_actions`, () =>
          HttpResponse.json({ experiment_recommended_actions: [] })
        )
      );
      expect(await client.listRecommendedActions()).toEqual([]);
    });

    it('should dismiss recommended action', async () => {
      server.use(
        http.put(`${BASE_URL}/experiment_recommended_actions/1/dismiss`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.dismissRecommendedAction(1 as any);
    });

    it('should create scheduled action', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/scheduled_action`, () =>
          HttpResponse.json({ scheduled_action: { id: 1, action: 'start' } })
        )
      );
      const result = await client.createScheduledAction(1, 'start', '2026-04-01', 'test');
      expect(result.action).toBe('start');
    });

    it('should delete scheduled action', async () => {
      server.use(
        http.delete(
          `${BASE_URL}/experiments/1/scheduled_action/2`,
          () => new HttpResponse(null, { status: 204 })
        )
      );
      await client.deleteScheduledAction(1, 2 as any);
    });
  });

  describe('applications, environments, unit types', () => {
    it('should list applications', async () => {
      server.use(
        http.get(`${BASE_URL}/applications`, () =>
          HttpResponse.json({ applications: [{ id: 1, name: 'web' }] })
        )
      );
      expect(await client.listApplications()).toHaveLength(1);
    });

    it('should create application', async () => {
      server.use(
        http.post(`${BASE_URL}/applications`, () =>
          HttpResponse.json({ application: { id: 1, name: 'web' } })
        )
      );
      expect((await client.createApplication({ name: 'web' })).name).toBe('web');
    });

    it('should archive application', async () => {
      server.use(
        http.put(`${BASE_URL}/applications/1/archive`, () => HttpResponse.json({ ok: true }))
      );
      await client.archiveApplication(1);
    });

    it('should list environments', async () => {
      server.use(
        http.get(`${BASE_URL}/environments`, () =>
          HttpResponse.json({ environments: [{ id: 1, name: 'prod' }] })
        )
      );
      expect(await client.listEnvironments()).toHaveLength(1);
    });

    it('should create environment', async () => {
      server.use(
        http.post(`${BASE_URL}/environments`, () =>
          HttpResponse.json({ environment: { id: 1, name: 'staging' } })
        )
      );
      expect((await client.createEnvironment({ name: 'staging' })).name).toBe('staging');
    });

    it('should list unit types', async () => {
      server.use(
        http.get(`${BASE_URL}/unit_types`, () =>
          HttpResponse.json({ unit_types: [{ id: 1, name: 'user_id' }] })
        )
      );
      expect(await client.listUnitTypes()).toHaveLength(1);
    });

    it('should create unit type', async () => {
      server.use(
        http.post(`${BASE_URL}/unit_types`, () =>
          HttpResponse.json({ unit_type: { id: 1, name: 'device' } })
        )
      );
      expect((await client.createUnitType({ name: 'device' })).name).toBe('device');
    });
  });

  describe('tags (experiment, goal, metric)', () => {
    it('should CRUD experiment tags', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_tags`, () => HttpResponse.json({ experiment_tags: [] }))
      );
      expect(await client.listExperimentTags()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/experiment_tags`, () =>
          HttpResponse.json({ experiment_tag: { id: 1, tag: 'v1' } })
        )
      );
      expect((await client.createExperimentTag({ tag: 'v1' })).tag).toBe('v1');

      server.use(
        http.delete(`${BASE_URL}/experiment_tags/1`, () => new HttpResponse(null, { status: 204 }))
      );
      await client.deleteExperimentTag(1 as any);
    });

    it('should CRUD goal tags', async () => {
      server.use(http.get(`${BASE_URL}/goal_tags`, () => HttpResponse.json({ goal_tags: [] })));
      expect(await client.listGoalTags()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/goal_tags`, () =>
          HttpResponse.json({ goal_tag: { id: 1, tag: 'rev' } })
        )
      );
      expect((await client.createGoalTag({ tag: 'rev' })).tag).toBe('rev');
    });

    it('should CRUD metric tags', async () => {
      server.use(http.get(`${BASE_URL}/metric_tags`, () => HttpResponse.json({ metric_tags: [] })));
      expect(await client.listMetricTags()).toEqual([]);
    });
  });

  describe('metric categories', () => {
    it('should list and create', async () => {
      server.use(
        http.get(`${BASE_URL}/metric_categories`, () =>
          HttpResponse.json({ metric_categories: [] })
        )
      );
      expect(await client.listMetricCategories()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/metric_categories`, () =>
          HttpResponse.json({ metric_category: { id: 1, name: 'Rev', color: '#ff0000' } })
        )
      );
      expect((await client.createMetricCategory({ name: 'Rev', color: '#ff0000' })).name).toBe(
        'Rev'
      );
    });

    it('should archive metric category', async () => {
      server.use(
        http.put(`${BASE_URL}/metric_categories/1/archive`, () => HttpResponse.json({ ok: true }))
      );
      await client.archiveMetricCategory(1 as any);
    });
  });

  describe('roles and permissions', () => {
    it('should list roles', async () => {
      server.use(
        http.get(`${BASE_URL}/roles`, () =>
          HttpResponse.json({ roles: [{ id: 1, name: 'Admin' }] })
        )
      );
      expect(await client.listRoles()).toHaveLength(1);
    });

    it('should create role', async () => {
      server.use(
        http.post(`${BASE_URL}/roles`, () => HttpResponse.json({ role: { id: 1, name: 'Editor' } }))
      );
      expect((await client.createRole({ name: 'Editor' } as any)).name).toBe('Editor');
    });

    it('should delete role', async () => {
      server.use(http.delete(`${BASE_URL}/roles/1`, () => new HttpResponse(null, { status: 204 })));
      await client.deleteRole(1 as any);
    });

    it('should list permissions', async () => {
      server.use(http.get(`${BASE_URL}/permissions`, () => HttpResponse.json({ permissions: [] })));
      expect(await client.listPermissions()).toEqual([]);
    });

    it('should list permission categories', async () => {
      server.use(
        http.get(`${BASE_URL}/permission_categories`, () =>
          HttpResponse.json({ permission_categories: [] })
        )
      );
      expect(await client.listPermissionCategories()).toEqual([]);
    });
  });

  describe('api keys', () => {
    it('should list api keys', async () => {
      server.use(http.get(`${BASE_URL}/api_keys`, () => HttpResponse.json({ api_keys: [] })));
      expect(await client.listApiKeys()).toEqual([]);
    });

    it('should create and delete api key', async () => {
      server.use(
        http.post(`${BASE_URL}/api_keys`, () => HttpResponse.json({ api_key: { id: 1 } }))
      );
      expect((await client.createApiKey({} as any)).id).toBe(1);

      server.use(
        http.delete(`${BASE_URL}/api_keys/1`, () => new HttpResponse(null, { status: 204 }))
      );
      await client.deleteApiKey(1 as any);
    });
  });

  describe('webhooks', () => {
    it('should list webhooks', async () => {
      server.use(http.get(`${BASE_URL}/webhooks`, () => HttpResponse.json({ webhooks: [] })));
      expect(await client.listWebhooks()).toEqual([]);
    });

    it('should create webhook', async () => {
      server.use(
        http.post(`${BASE_URL}/webhooks`, () => HttpResponse.json({ webhook: { id: 1 } }))
      );
      expect((await client.createWebhook({} as any)).id).toBe(1);
    });

    it('should list webhook events', async () => {
      server.use(
        http.get(`${BASE_URL}/webhook_events`, () =>
          HttpResponse.json({ webhook_events: ['experiment.started'] })
        )
      );
      expect(await client.listWebhookEvents()).toContain('experiment.started');
    });
  });

  describe('follow/unfollow', () => {
    it('should follow experiment', async () => {
      server.use(
        http.post(`${BASE_URL}/experiments/1/follow`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.followExperiment(1);
    });

    it('should unfollow experiment', async () => {
      server.use(
        http.delete(`${BASE_URL}/experiments/1/follow`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.unfollowExperiment(1);
    });

    it('should follow/unfollow metric', async () => {
      server.use(
        http.post(`${BASE_URL}/metrics/1/follow`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.followMetric(1 as any);
      server.use(
        http.delete(`${BASE_URL}/metrics/1/follow`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.unfollowMetric(1 as any);
    });

    it('should follow/unfollow goal', async () => {
      server.use(
        http.post(`${BASE_URL}/goals/1/follow`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.followGoal(1 as any);
      server.use(
        http.delete(`${BASE_URL}/goals/1/follow`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.unfollowGoal(1 as any);
    });
  });

  describe('favorites', () => {
    it('should favorite experiment', async () => {
      server.use(http.put(`${BASE_URL}/favorites/experiment`, () => HttpResponse.json({})));
      await client.favoriteExperiment(1, true);
    });

    it('should favorite metric', async () => {
      server.use(http.put(`${BASE_URL}/favorites/metric`, () => HttpResponse.json({})));
      await client.favoriteMetric(1 as any, false);
    });
  });

  describe('notifications', () => {
    it('should get notifications', async () => {
      server.use(
        http.get(`${BASE_URL}/notifications/summary`, () =>
          HttpResponse.json({ notifications: [{ id: 1 }] })
        )
      );
      expect(await client.getNotifications()).toHaveLength(1);
    });

    it('should handle missing notifications array', async () => {
      server.use(http.get(`${BASE_URL}/notifications/summary`, () => HttpResponse.json({})));
      await expect(client.getNotifications()).rejects.toThrow(/Missing "notifications"/);
    });

    it('should mark notifications seen', async () => {
      server.use(
        http.put(`${BASE_URL}/notifications/see`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.markNotificationsSeen();
    });

    it('should mark notifications read', async () => {
      server.use(
        http.put(`${BASE_URL}/notifications/read`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.markNotificationsRead([1, 2]);
    });

    it('should check for new notifications', async () => {
      server.use(
        http.get(`${BASE_URL}/notifications/has-new`, () => HttpResponse.json({ has_new: true }))
      );
      expect(await client.hasNewNotifications()).toBe(true);
    });
  });

  describe('access control', () => {
    it('should list/grant/revoke experiment access users', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1/asset_role_users`, () =>
          HttpResponse.json({ asset_role_experiment_users: [{ user_id: 1 }] })
        )
      );
      expect(await client.listExperimentAccessUsers(1)).toHaveLength(1);

      server.use(
        http.post(
          `${BASE_URL}/experiments/1/asset_role_users`,
          () => new HttpResponse(null, { status: 201 })
        )
      );
      await client.grantExperimentAccessUser(1, 1 as any, 1 as any);

      server.use(
        http.delete(
          `${BASE_URL}/experiments/1/asset_role_users/1/1`,
          () => new HttpResponse(null, { status: 204 })
        )
      );
      await client.revokeExperimentAccessUser(1, 1 as any, 1 as any);
    });

    it('should list/grant/revoke experiment access teams', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1/asset_role_teams`, () =>
          HttpResponse.json({ asset_role_experiment_teams: [] })
        )
      );
      expect(await client.listExperimentAccessTeams(1)).toEqual([]);
    });

    it('should list metric access users', async () => {
      server.use(
        http.get(`${BASE_URL}/metrics/1/asset_role_users`, () =>
          HttpResponse.json({ asset_role_metric_users: [] })
        )
      );
      expect(await client.listMetricAccessUsers(1 as any)).toEqual([]);
    });

    it('should list goal access users', async () => {
      server.use(
        http.get(`${BASE_URL}/goals/1/asset_role_users`, () =>
          HttpResponse.json({ asset_role_goal_users: [] })
        )
      );
      expect(await client.listGoalAccessUsers(1 as any)).toEqual([]);
    });
  });

  describe('asset roles', () => {
    it('should list asset roles', async () => {
      server.use(http.get(`${BASE_URL}/asset_roles`, () => HttpResponse.json({ asset_roles: [] })));
      expect(await client.listAssetRoles()).toEqual([]);
    });

    it('should create and delete asset role', async () => {
      server.use(
        http.post(`${BASE_URL}/asset_roles`, () =>
          HttpResponse.json({ asset_role: { id: 1, name: 'Reviewer' } })
        )
      );
      expect((await client.createAssetRole({ name: 'Reviewer' })).name).toBe('Reviewer');

      server.use(
        http.delete(`${BASE_URL}/asset_roles/1`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.deleteAssetRole(1 as any);
    });
  });

  describe('metric reviews', () => {
    it('should request/get/approve metric review', async () => {
      server.use(
        http.post(`${BASE_URL}/metrics/1/review/request`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.requestMetricReview(1 as any);

      server.use(
        http.get(`${BASE_URL}/metrics/1/review`, () =>
          HttpResponse.json({ ok: true, status: 'pending' })
        )
      );
      const review = await client.getMetricReview(1 as any);
      expect(review).toBeDefined();

      server.use(
        http.post(`${BASE_URL}/metrics/1/review/approve`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.approveMetricReview(1 as any);
    });

    it('should list/add/reply review comments', async () => {
      server.use(
        http.get(`${BASE_URL}/metrics/1/review/comments`, () => HttpResponse.json({ comments: [] }))
      );
      expect(await client.listMetricReviewComments(1 as any)).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/metrics/1/review/comments`, () =>
          HttpResponse.json({ comment: { id: 1 } })
        )
      );
      await client.addMetricReviewComment(1 as any, 'looks good');

      server.use(
        http.post(`${BASE_URL}/metrics/1/review/comments/1/reply`, () =>
          HttpResponse.json({ comment: { id: 2 } })
        )
      );
      await client.replyToMetricReviewComment(1 as any, 1, 'thanks');
    });
  });

  describe('annotations', () => {
    it('should list annotations', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_annotations`, () =>
          HttpResponse.json({ experiment_annotations: [] })
        )
      );
      expect(await client.listAnnotations()).toEqual([]);
    });

    it('should create annotation', async () => {
      server.use(
        http.post(`${BASE_URL}/experiment_annotations`, () =>
          HttpResponse.json({ experiment_annotation: { id: 1 } })
        )
      );
      await client.createAnnotation({ experiment_id: 1 });
    });

    it('should archive annotation', async () => {
      server.use(
        http.put(`${BASE_URL}/experiment_annotations/1/archive`, () =>
          HttpResponse.json({ ok: true })
        )
      );
      await client.archiveAnnotation(1 as any);
    });
  });

  describe('custom sections and fields', () => {
    it('should list custom section fields', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_custom_section_fields`, () =>
          HttpResponse.json({ experiment_custom_section_fields: [{ id: 1, name: 'f1' }] })
        )
      );
      expect(await client.listCustomSectionFields()).toHaveLength(1);
    });

    it('should list custom sections', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_custom_sections`, () =>
          HttpResponse.json({ experiment_custom_sections: [] })
        )
      );
      expect(await client.listCustomSections()).toEqual([]);
    });

    it('should reorder custom sections', async () => {
      server.use(
        http.put(`${BASE_URL}/experiment_custom_sections/order`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.reorderCustomSections([{ id: 1, order_index: 0 }]);
    });
  });

  describe('insights', () => {
    it('should get velocity insights', async () => {
      server.use(
        http.get(`${BASE_URL}/insights/velocity/summary`, () => HttpResponse.json({ data: [] }))
      );
      const result = await client.getVelocityInsights({
        from: 1000,
        to: 2000,
        aggregation: 'month',
      });
      expect(result).toBeDefined();
    });

    it('should get decision insights', async () => {
      server.use(
        http.get(`${BASE_URL}/insights/decisions/widgets`, () => HttpResponse.json({ data: [] }))
      );
      const result = await client.getDecisionInsights({
        from: 1000,
        to: 2000,
        aggregation: 'week',
      });
      expect(result).toBeDefined();
    });
  });

  describe('platform config', () => {
    it('should list/get/update platform configs', async () => {
      server.use(http.get(`${BASE_URL}/configs`, () => HttpResponse.json({ configs: [] })));
      expect(await client.listPlatformConfigs()).toEqual([]);

      server.use(http.get(`${BASE_URL}/configs/1`, () => HttpResponse.json({ config: { id: 1 } })));
      expect(await client.getPlatformConfig(1)).toBeDefined();

      server.use(http.put(`${BASE_URL}/configs/1`, () => HttpResponse.json({ config: { id: 1 } })));
      await client.updatePlatformConfig(1, { name: 'cfg', value: 'val' });
    });

    it('should PUT the full config object under data, not the bare value', async () => {
      let sentBody: Record<string, unknown> = {};
      server.use(
        http.put(`${BASE_URL}/configs/22`, async ({ request }) => {
          sentBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            ok: true,
            config: { id: 22, name: 'experiment_form_max_secondary_metrics', value: '30' },
          });
        })
      );

      await client.updatePlatformConfig(22, {
        name: 'experiment_form_max_secondary_metrics',
        value: '30',
      });

      // Wire body must be {data: {name, value}} — not {data: '30'} or {data: {data: ...}}
      expect(sentBody).toEqual({
        data: { name: 'experiment_form_max_secondary_metrics', value: '30' },
      });
    });
  });

  describe('CORS origins', () => {
    it('should list/create/delete CORS origins', async () => {
      server.use(
        http.get(`${BASE_URL}/cors`, () => HttpResponse.json({ cors_allowed_origins: [] }))
      );
      expect(await client.listCorsOrigins()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/cors`, () =>
          HttpResponse.json({ cors_allowed_origin: { id: 1, origin: 'https://a.com' } })
        )
      );
      await client.createCorsOrigin({ origin: 'https://a.com' });

      server.use(
        http.delete(`${BASE_URL}/cors/1`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.deleteCorsOrigin(1 as any);
    });
  });

  describe('datasources', () => {
    it('should list/create datasources', async () => {
      server.use(
        http.get(`${BASE_URL}/datasources`, () =>
          HttpResponse.json({ event_datasource_configs: [] })
        )
      );
      expect(await client.listDatasources()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/datasources`, () =>
          HttpResponse.json({ event_datasource_config: { id: 1 } })
        )
      );
      await client.createDatasource({ type: 'pg' });
    });

    it('should test/introspect/validate datasource', async () => {
      server.use(
        http.post(`${BASE_URL}/datasources/test`, () => HttpResponse.json({ ok: true, errors: [] }))
      );
      await client.testDatasource({ type: 'pg' });

      server.use(
        http.post(`${BASE_URL}/datasources/introspect`, () => HttpResponse.json({ tables: [] }))
      );
      await client.introspectDatasource({ type: 'pg' });

      server.use(
        http.post(`${BASE_URL}/datasources/validate_query`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.validateDatasourceQuery({ query: 'SELECT 1' });
    });

    it('should archive datasource', async () => {
      server.use(
        http.put(`${BASE_URL}/datasources/1/archive`, () => HttpResponse.json({ ok: true }))
      );
      await client.archiveDatasource(1 as any);
    });
  });

  describe('export configs', () => {
    it('should list/create/archive export configs', async () => {
      server.use(
        http.get(`${BASE_URL}/export_configs`, () => HttpResponse.json({ export_configs: [] }))
      );
      expect(await client.listExportConfigs()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/export_configs`, () =>
          HttpResponse.json({ export_config: { id: 1 } })
        )
      );
      await client.createExportConfig({ dest: 's3' });

      server.use(
        http.put(`${BASE_URL}/export_configs/1/archive`, () => HttpResponse.json({ ok: true }))
      );
      await client.archiveExportConfig(1 as any);
    });

    it('should pause export config', async () => {
      server.use(
        http.put(`${BASE_URL}/export_configs/1/pause`, () =>
          HttpResponse.json({ ok: true, errors: [] })
        )
      );
      await client.pauseExportConfig(1 as any);
    });

    it('should list export histories', async () => {
      server.use(
        http.get(`${BASE_URL}/export_configs/1/export_histories`, () =>
          HttpResponse.json({ export_histories: [] })
        )
      );
      expect(await client.listExportHistories(1 as any)).toEqual([]);
    });
  });

  describe('update schedules', () => {
    it('should list/create/delete update schedules', async () => {
      server.use(
        http.get(`${BASE_URL}/experiment_update_schedules`, () =>
          HttpResponse.json({ experiment_update_schedules: [] })
        )
      );
      expect(await client.listUpdateSchedules()).toEqual([]);

      server.use(
        http.post(`${BASE_URL}/experiment_update_schedules`, () =>
          HttpResponse.json({ experiment_update_schedule: { id: 1 } })
        )
      );
      await client.createUpdateSchedule({ interval: '1h' });

      server.use(
        http.delete(
          `${BASE_URL}/experiment_update_schedules/1`,
          () => new HttpResponse(null, { status: 204 })
        )
      );
      await client.deleteUpdateSchedule(1 as any);
    });
  });

  describe('access control policies', () => {
    it('should list access control policies', async () => {
      server.use(
        http.get(`${BASE_URL}/access_control_policies`, () =>
          HttpResponse.json({ access_control_policies: [] })
        )
      );
      expect(await client.listAccessControlPolicies()).toEqual([]);
    });
  });

  describe('resolveExperimentId', () => {
    it('should return numeric ID directly for a clean numeric string', async () => {
      const result = await client.resolveExperimentId('42');
      expect(result).toBe(42);
    });

    it('should search when string does not round-trip through parseInt', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({ experiments: [{ id: 42, name: '042', state: 'running' }] })
        )
      );
      const result = await client.resolveExperimentId('042');
      expect(result).toBe(42);
    });

    it('should return exact name match when one exists', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({ experiments: [{ id: 5, name: 'my-experiment', state: 'running' }] })
        )
      );
      const result = await client.resolveExperimentId('my-experiment');
      expect(result).toBe(5);
    });

    it('should pick the highest ID when multiple exact name matches exist', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({
            experiments: [
              { id: 3, name: 'my-experiment', state: 'stopped' },
              { id: 10, name: 'my-experiment', state: 'running' },
              { id: 7, name: 'my-experiment', state: 'development' },
            ],
          })
        )
      );
      const result = await client.resolveExperimentId('my-experiment');
      expect(result).toBe(10);
    });

    it('should emit a warning to stderr when multiple exact name matches exist', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({
            experiments: [
              { id: 3, name: 'my-experiment', state: 'stopped' },
              { id: 10, name: 'my-experiment', state: 'running' },
              { id: 7, name: 'my-experiment', state: 'development' },
            ],
          })
        )
      );
      const result = await client.resolveExperimentId('my-experiment');
      expect(result).toBe(10);
      const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
      expect(errorOutput).toContain('3 experiments match name "my-experiment"');
      expect(errorOutput).toContain('Using most recent: id 10');
      consoleErrorSpy.mockRestore();
    });

    it('should not emit a warning when only one exact name match exists', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({
            experiments: [{ id: 5, name: 'my-experiment', state: 'running' }],
          })
        )
      );
      const result = await client.resolveExperimentId('my-experiment');
      expect(result).toBe(5);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should return the single non-exact match when only one result exists', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({
            experiments: [{ id: 99, name: 'my-experiment-v2', state: 'running' }],
          })
        )
      );
      const result = await client.resolveExperimentId('my-experiment');
      expect(result).toBe(99);
    });

    it('should throw with suggestions when multiple non-exact matches exist', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments`, () =>
          HttpResponse.json({
            experiments: [
              { id: 1, name: 'my-experiment-v1', state: 'stopped' },
              { id: 2, name: 'my-experiment-v2', state: 'running' },
            ],
          })
        )
      );
      await expect(client.resolveExperimentId('my-experiment')).rejects.toThrow(/Did you mean/);
    });

    it('should throw not found when search returns zero results', async () => {
      server.use(http.get(`${BASE_URL}/experiments`, () => HttpResponse.json({ experiments: [] })));
      await expect(client.resolveExperimentId('nonexistent')).rejects.toThrow(/not found/);
    });
  });

  describe('updateExperiment merge', () => {
    it('should merge update data with existing experiment data', async () => {
      server.use(
        http.get(`${BASE_URL}/experiments/1`, () =>
          HttpResponse.json({
            experiment: { id: 1, name: 'test', display_name: 'Original', description: 'Keep me' },
          })
        )
      );
      let sentBody: Record<string, unknown> = {};
      server.use(
        http.put(`${BASE_URL}/experiments/1`, async ({ request }) => {
          sentBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ok: true, experiment: { id: 1, ...sentBody }, errors: [] });
        })
      );
      await client.updateExperiment(1, { display_name: 'Updated' } as any);
      const data = sentBody.data as Record<string, unknown>;
      expect(data.description).toBe('Keep me');
      expect(data.display_name).toBe('Updated');
    });
  });

  describe('file uploads', () => {
    it('should upload a file', async () => {
      const uploadResponse = {
        file: {
          id: 399,
          file_usage_id: 2,
          width: 1,
          height: 1,
          file_size: 67,
          file_name: '1x1.png',
          content_type: 'image/png',
          base_url: '/files/variant_screenshots/abc123',
          crop_left: 0,
          crop_top: 0,
          crop_width: 1,
          crop_height: 1,
        },
      };

      server.use(
        http.post(`${BASE_URL}/file_uploads/variant_screenshots`, () => {
          return HttpResponse.json(uploadResponse);
        })
      );

      const result = await client.uploadFile('variant_screenshots', {
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGIAAAACAAEAyCL1OAAAAABJRU5ErkJggg==',
        file_name: '1x1.png',
        file_size: 67,
        content_type: 'image/png',
        width: 1,
        height: 1,
        crop_left: 0,
        crop_top: 0,
        crop_width: 1,
        crop_height: 1,
      });

      expect(result.id).toBe(399);
      expect(result.file_name).toBe('1x1.png');
      expect(result.base_url).toBe('/files/variant_screenshots/abc123');
    });
  });
});
