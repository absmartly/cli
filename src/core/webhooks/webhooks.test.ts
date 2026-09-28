import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listWebhooks } from './list.js';
import { getWebhook } from './get.js';
import { createWebhook } from './create.js';
import { updateWebhook } from './update.js';
import { deleteWebhook } from './delete.js';
import { listWebhookEvents } from './events.js';

const mockClient = {
  listWebhooks: vi.fn(),
  getWebhook: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  listWebhookEvents: vi.fn(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('listWebhooks', () => {
  it('should list webhooks', async () => {
    const hooks = [{ id: 1 }, { id: 2 }];
    mockClient.listWebhooks.mockResolvedValue(hooks);

    const result = await listWebhooks(mockClient, { items: 10, page: 1 });

    expect(mockClient.listWebhooks).toHaveBeenCalledWith({ items: 10, page: 1 });
    expect(result.data).toEqual(hooks);
  });

  it('should include summarized rows', async () => {
    const hooks = [{ id: 1, name: 'H1', url: 'https://a.com', enabled: true, archived: false }];
    mockClient.listWebhooks.mockResolvedValue(hooks);

    const result = await listWebhooks(mockClient, { items: 10, page: 1 });

    expect(result.rows).toBeDefined();
    expect(result.rows![0]).toMatchObject({
      id: 1,
      name: 'H1',
      url: 'https://a.com',
      enabled: true,
    });
  });
});

describe('getWebhook', () => {
  const hook = { id: 5, name: 'hook', url: 'https://x.com', enabled: true, secret: 'shh' };

  it('should return summarized data by default', async () => {
    mockClient.getWebhook.mockResolvedValue(hook);
    const result = await getWebhook(mockClient, { id: 5 as any });
    expect(result.data).not.toHaveProperty('secret');
    expect(result.data).toMatchObject({ id: 5, name: 'hook', url: 'https://x.com' });
  });

  it('should return raw data when raw=true', async () => {
    mockClient.getWebhook.mockResolvedValue(hook);
    const result = await getWebhook(mockClient, { id: 5 as any, raw: true });
    expect(result.data).toEqual(hook);
  });
});

describe('createWebhook', () => {
  it('should create with required fields only', async () => {
    const created = { id: 10 };
    mockClient.createWebhook.mockResolvedValue(created);

    const result = await createWebhook(mockClient, {
      name: 'hook',
      url: 'https://example.com/hook',
    });

    expect(mockClient.createWebhook).toHaveBeenCalledWith({
      name: 'hook',
      url: 'https://example.com/hook',
    });
    expect(result).toEqual({ data: created });
  });

  it('should include all optional fields', async () => {
    mockClient.createWebhook.mockResolvedValue({ id: 11 });

    await createWebhook(mockClient, {
      name: 'hook',
      url: 'https://example.com/hook',
      description: 'desc',
      enabled: true,
      ordered: false,
      maxRetries: 3,
    });

    expect(mockClient.createWebhook).toHaveBeenCalledWith({
      name: 'hook',
      url: 'https://example.com/hook',
      description: 'desc',
      enabled: true,
      ordered: false,
      max_retries: 3,
    });
  });
});

describe('updateWebhook', () => {
  it('should update name', async () => {
    mockClient.updateWebhook.mockResolvedValue(undefined);

    const result = await updateWebhook(mockClient, { id: 5 as any, name: 'new-name' });

    expect(mockClient.updateWebhook).toHaveBeenCalledWith(5, { name: 'new-name' });
    expect(result).toEqual({ data: { id: 5 } });
  });

  it('should update multiple fields', async () => {
    mockClient.updateWebhook.mockResolvedValue(undefined);

    await updateWebhook(mockClient, {
      id: 5 as any,
      url: 'https://new.com',
      enabled: false,
      maxRetries: 5,
    });

    expect(mockClient.updateWebhook).toHaveBeenCalledWith(5, {
      url: 'https://new.com',
      enabled: false,
      max_retries: 5,
    });
  });

  it('should throw when no fields provided', async () => {
    await expect(updateWebhook(mockClient, { id: 5 as any })).rejects.toThrow(
      'At least one update field must be provided'
    );
  });
});

describe('deleteWebhook', () => {
  it('should delete webhook', async () => {
    mockClient.deleteWebhook.mockResolvedValue(undefined);

    const result = await deleteWebhook(mockClient, { id: 7 as any });

    expect(mockClient.deleteWebhook).toHaveBeenCalledWith(7);
    expect(result).toEqual({ data: { id: 7 } });
  });
});

describe('listWebhookEvents', () => {
  it('should list events', async () => {
    const events = ['experiment.created', 'experiment.updated'];
    mockClient.listWebhookEvents.mockResolvedValue(events);

    const result = await listWebhookEvents(mockClient);

    expect(mockClient.listWebhookEvents).toHaveBeenCalled();
    expect(result).toEqual({ data: events });
  });
});
