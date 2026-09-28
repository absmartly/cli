import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateSchedulesCommand } from './index.js';
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

describe('update-schedules command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listUpdateSchedules: vi.fn().mockResolvedValue([{ id: 1, name: 'sched1' }]),
    getUpdateSchedule: vi.fn().mockResolvedValue({ id: 1, name: 'sched1' }),
    createUpdateSchedule: vi.fn().mockResolvedValue({ id: 2 }),
    updateUpdateSchedule: vi.fn().mockResolvedValue({ id: 1 }),
    deleteUpdateSchedule: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(updateSchedulesCommand);
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

  it('should list update schedules', async () => {
    await updateSchedulesCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listUpdateSchedules).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list update schedules with pagination', async () => {
    await updateSchedulesCommand.parseAsync([
      'node',
      'test',
      'list',
      '--items',
      '10',
      '--page',
      '2',
    ]);

    expect(mockClient.listUpdateSchedules).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should get update schedule by id', async () => {
    await updateSchedulesCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getUpdateSchedule).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create an update schedule', async () => {
    await updateSchedulesCommand.parseAsync([
      'node',
      'test',
      'create',
      '--json-config',
      '{"name":"daily"}',
    ]);

    expect(mockClient.createUpdateSchedule).toHaveBeenCalledWith({ name: 'daily' });
  });

  it('should update an update schedule', async () => {
    await updateSchedulesCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--json-config',
      '{"name":"weekly"}',
    ]);

    expect(mockClient.updateUpdateSchedule).toHaveBeenCalledWith(1, { name: 'weekly' });
  });

  it('should delete an update schedule', async () => {
    await updateSchedulesCommand.parseAsync(['node', 'test', 'delete', '1']);

    expect(mockClient.deleteUpdateSchedule).toHaveBeenCalledWith(1);
  });
});
