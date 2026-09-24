import { describe, it, expect, vi } from 'vitest';
import {
  listNotifications,
  markNotificationsSeen,
  markNotificationsRead,
  checkNotifications,
} from './notifications.js';

describe('notifications', () => {
  const mockClient = {
    getNotifications: vi.fn(),
    markNotificationsSeen: vi.fn(),
    markNotificationsRead: vi.fn(),
    hasNewNotifications: vi.fn(),
  };

  it('should list notifications without cursor', async () => {
    mockClient.getNotifications.mockResolvedValue([{ id: 1 }]);
    const result = await listNotifications(mockClient as any, {});
    expect(mockClient.getNotifications).toHaveBeenCalledWith(undefined);
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('should list notifications with cursor', async () => {
    mockClient.getNotifications.mockResolvedValue([{ id: 2 }]);
    const result = await listNotifications(mockClient as any, { cursor: 5 });
    expect(mockClient.getNotifications).toHaveBeenCalledWith(5);
    expect(result.data).toEqual([{ id: 2 }]);
  });

  it('should mark notifications seen', async () => {
    mockClient.markNotificationsSeen.mockResolvedValue(undefined);
    const result = await markNotificationsSeen(mockClient as any);
    expect(mockClient.markNotificationsSeen).toHaveBeenCalled();
    expect(result.data).toBeUndefined();
  });

  it('should mark notifications read with ids', async () => {
    mockClient.markNotificationsRead.mockResolvedValue(undefined);
    const result = await markNotificationsRead(mockClient as any, { ids: [1, 2, 3] });
    expect(mockClient.markNotificationsRead).toHaveBeenCalledWith([1, 2, 3]);
    expect(result.data).toBeUndefined();
  });

  it('should mark notifications read without ids', async () => {
    mockClient.markNotificationsRead.mockResolvedValue(undefined);
    const result = await markNotificationsRead(mockClient as any, {});
    expect(mockClient.markNotificationsRead).toHaveBeenCalledWith(undefined);
    expect(result.data).toBeUndefined();
  });

  it('should check for new notifications', async () => {
    mockClient.hasNewNotifications.mockResolvedValue(true);
    const result = await checkNotifications(mockClient as any, { lastId: 10 });
    expect(mockClient.hasNewNotifications).toHaveBeenCalledWith(10);
    expect(result.data).toEqual({ hasNew: true });
  });

  it('should check for new notifications without lastId', async () => {
    mockClient.hasNewNotifications.mockResolvedValue(false);
    const result = await checkNotifications(mockClient as any, {});
    expect(mockClient.hasNewNotifications).toHaveBeenCalledWith(undefined);
    expect(result.data).toEqual({ hasNew: false });
  });

  describe('listNotifications limit', () => {
    it('should cap results to the default limit and warn when truncated', async () => {
      const all = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      mockClient.getNotifications.mockResolvedValue(all);

      const result = await listNotifications(mockClient as any, {});

      expect((result.data as unknown[]).length).toBe(20);
      expect(result.warnings).toEqual([
        'Showing 20 of 50 notifications. Use --limit to show more.',
      ]);
    });

    it('should not warn when under the limit', async () => {
      mockClient.getNotifications.mockResolvedValue([{ id: 1 }]);
      const result = await listNotifications(mockClient as any, {});
      expect(result.warnings).toBeUndefined();
    });

    it('should respect an explicit limit', async () => {
      const all = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      mockClient.getNotifications.mockResolvedValue(all);
      const result = await listNotifications(mockClient as any, { limit: 5 });
      expect((result.data as unknown[]).length).toBe(5);
    });
  });
});
