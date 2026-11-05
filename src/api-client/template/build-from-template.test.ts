import { describe, it, expect, vi } from 'vitest';
import { buildPayloadFromTemplate } from './build-from-template.js';
import { parseExperimentMarkdown } from './parser.js';
import type { APIClient } from '../api-client.js';

const metrics = [
  { id: 1, name: 'clicks' },
  { id: 2, name: 'revenue' },
];
const users = [
  { id: 7, email: 'ann@example.com', first_name: 'Ann', last_name: 'Lee' },
  { id: 8, email: 'bob@example.com', first_name: 'Bob', last_name: 'Ho' },
];

function stubClient() {
  const client = {
    listApplications: vi.fn().mockResolvedValue([{ id: 1, name: 'web' }]),
    listUnitTypes: vi.fn().mockResolvedValue([{ id: 1, name: 'user_id' }]),
    listCustomSectionFields: vi.fn().mockResolvedValue([]),
    listMetrics: vi.fn(async ({ search }: { search: string }) =>
      metrics.filter((m) => m.name === search)
    ),
    listUsers: vi.fn(async ({ search }: { search: string }) =>
      users.filter((u) => u.email === search || `${u.first_name} ${u.last_name}` === search)
    ),
    listTeams: vi.fn().mockResolvedValue([]),
    listExperimentTags: vi.fn().mockResolvedValue([]),
  };
  return client;
}

async function build(md: string) {
  const client = stubClient();
  const result = await buildPayloadFromTemplate(
    client as unknown as APIClient,
    parseExperimentMarkdown(md)
  );
  return { ...result, client };
}

describe('buildPayloadFromTemplate', () => {
  it('resolves numeric metric IDs without searching, alongside names', async () => {
    const { payload, client } = await build(`---
name: exp
primary_metric: "42"
secondary_metrics: ["43", clicks]
guardrail_metrics: [revenue, "44"]
---
`);
    expect(payload.primary_metric).toEqual({ metric_id: 42 });
    expect(payload.secondary_metrics).toEqual([
      { metric_id: 43, type: 'secondary', order_index: 0 },
      { metric_id: 1, type: 'secondary', order_index: 1 },
      { metric_id: 2, type: 'guardrail', order_index: 2 },
      { metric_id: 44, type: 'guardrail', order_index: 3 },
    ]);
    expect(client.listMetrics.mock.calls.map(([q]) => q.search)).toEqual(['clicks', 'revenue']);
  });

  it('resolves a primary metric by name when other refs are numeric', async () => {
    const { payload } = await build(
      '---\nname: exp\nprimary_metric: clicks\nsecondary_metrics: ["9"]\n---\n'
    );
    expect(payload.primary_metric).toEqual({ metric_id: 1 });
  });

  it('resolves numeric owner IDs without searching, alongside emails and names', async () => {
    const { payload, warnings, client } = await build(`---
name: exp
owners: ["42", bob@example.com, Ann Lee, "Bob Ho <bob@example.com>"]
---
`);
    expect(payload.owners).toEqual([
      { user_id: 42 },
      { user_id: 8 },
      { user_id: 7 },
      { user_id: 8 },
    ]);
    expect(warnings.filter((w) => w.startsWith('Owner'))).toEqual([]);
    expect(client.listUsers.mock.calls.map(([q]) => q.search)).toEqual([
      'bob@example.com',
      'Ann Lee',
    ]);
  });

  it('accepts numeric IDs past the search limit, as its error message suggests', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `"${1000 + i}"`).join(', ');
    const { payload, client } = await build(
      `---\nname: exp\nsecondary_metrics: [${ids}]\nowners: [${ids}]\n---\n`
    );
    expect(payload.secondary_metrics).toHaveLength(150);
    expect(payload.owners).toHaveLength(150);
    expect(client.listMetrics).not.toHaveBeenCalled();
    expect(client.listUsers).not.toHaveBeenCalled();
  });

  it('refuses more than 100 distinct metric names before searching', async () => {
    const names = Array.from({ length: 101 }, (_, i) => `m${i}`).join(', ');
    const client = stubClient();
    await expect(
      buildPayloadFromTemplate(
        client as unknown as APIClient,
        parseExperimentMarkdown(`---\nname: exp\nsecondary_metrics: [${names}]\n---\n`)
      )
    ).rejects.toThrow(/101 distinct names need a search; the limit is 100/);
    expect(client.listMetrics).not.toHaveBeenCalled();
  });
});
