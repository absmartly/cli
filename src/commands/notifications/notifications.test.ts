import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notificationsCommand } from './index.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
  };
});

describe('notifications command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    getNotifications: vi.fn(),
    markNotificationsSeen: vi.fn(),
    markNotificationsRead: vi.fn(),
    hasNewNotifications: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(notificationsCommand);
    vi.mocked(getAPIClientFromOptions).mockResolvedValue(mockClient as any);
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table' } as any);
    vi.mocked(printFormatted).mockImplementation(() => {});
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => {
      throw new Error(`process.exit: ${code}`);
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should list notifications', async () => {
    mockClient.getNotifications.mockResolvedValue([{ id: 1 }]);
    await notificationsCommand.parseAsync(['node', 'test', 'list']);
    expect(mockClient.getNotifications).toHaveBeenCalledWith(undefined);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list notifications with cursor', async () => {
    mockClient.getNotifications.mockResolvedValue([]);
    await notificationsCommand.parseAsync(['node', 'test', 'list', '--cursor', '100']);
    expect(mockClient.getNotifications).toHaveBeenCalledWith(100);
  });

  it('should not print truncation warnings when output is json', async () => {
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'json' } as any);
    const all = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    mockClient.getNotifications.mockResolvedValue(all);
    await notificationsCommand.parseAsync(['node', 'test', 'list', '--limit', '20']);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).not.toContain('Showing 20 of 50 notifications');
  });

  it('should print truncation warnings for table output', async () => {
    const all = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    mockClient.getNotifications.mockResolvedValue(all);
    await notificationsCommand.parseAsync(['node', 'test', 'list', '--limit', '20']);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Showing 20 of 50 notifications');
  });

  it('should reject a negative --limit instead of returning an inverted slice', async () => {
    mockClient.getNotifications.mockResolvedValue([{ id: 1 }]);
    await expect(
      notificationsCommand.parseAsync(['node', 'test', 'list', '--limit', '-1'])
    ).rejects.toThrow('process.exit: 1');
    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('Invalid value for --limit');
    expect(mockClient.getNotifications).not.toHaveBeenCalled();
  });

  it('should reject a non-numeric --limit instead of silently returning nothing', async () => {
    mockClient.getNotifications.mockResolvedValue([{ id: 1 }]);
    await expect(
      notificationsCommand.parseAsync(['node', 'test', 'list', '--limit', 'abc'])
    ).rejects.toThrow('process.exit: 1');
    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('Invalid value for --limit');
  });

  it('should mark notifications as seen', async () => {
    mockClient.markNotificationsSeen.mockResolvedValue(undefined);
    await notificationsCommand.parseAsync(['node', 'test', 'mark-seen']);
    expect(mockClient.markNotificationsSeen).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('marked as seen');
  });

  it('should mark all notifications as read', async () => {
    mockClient.markNotificationsRead.mockResolvedValue(undefined);
    await notificationsCommand.parseAsync(['node', 'test', 'mark-read']);
    expect(mockClient.markNotificationsRead).toHaveBeenCalledWith(undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('marked as read');
  });

  it('should mark specific notifications as read', async () => {
    mockClient.markNotificationsRead.mockResolvedValue(undefined);
    await notificationsCommand.parseAsync(['node', 'test', 'mark-read', '--ids', '1,2,3']);
    expect(mockClient.markNotificationsRead).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('should check for new notifications when there are none', async () => {
    mockClient.hasNewNotifications.mockResolvedValue(false);
    await notificationsCommand.parseAsync(['node', 'test', 'check']);
    expect(mockClient.hasNewNotifications).toHaveBeenCalledWith(undefined);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('No new notifications');
  });

  it('should check for new notifications when there are some', async () => {
    mockClient.hasNewNotifications.mockResolvedValue(true);
    await notificationsCommand.parseAsync(['node', 'test', 'check']);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('new notifications');
  });

  it('should check with last-id', async () => {
    mockClient.hasNewNotifications.mockResolvedValue(false);
    await notificationsCommand.parseAsync(['node', 'test', 'check', '--last-id', '99']);
    expect(mockClient.hasNewNotifications).toHaveBeenCalledWith(99);
  });
});
