import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usersCommand } from './index.js';
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

describe('users command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listUsers: vi.fn().mockResolvedValue([{ id: 1, email: 'test@test.com' }]),
    getUser: vi.fn().mockResolvedValue({ id: 1, email: 'test@test.com' }),
    createUser: vi.fn().mockResolvedValue({ id: 99 }),
    updateUser: vi.fn().mockResolvedValue({}),
    archiveUser: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(usersCommand);
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

  it('should list users', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listUsers).toHaveBeenCalledWith({
      includeArchived: undefined,
      items: 20,
      page: 1,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list users with --include-archived', async () => {
    await usersCommand.parseAsync(['node', 'test', 'list', '--include-archived']);

    expect(mockClient.listUsers).toHaveBeenCalledWith({
      includeArchived: true,
      items: 20,
      page: 1,
    });
  });

  it('should get user by id', async () => {
    await usersCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getUser).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.anything()
    );
  });

  it('should create a user', async () => {
    await usersCommand.parseAsync([
      'node',
      'test',
      'create',
      '--email',
      'j@t.com',
      '--name',
      'John Doe',
    ]);

    expect(mockClient.createUser).toHaveBeenCalledWith({
      email: 'j@t.com',
      first_name: 'John',
      last_name: 'Doe',
    });
  });

  it('should update a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'update', '1', '--name', 'Jane Smith']);

    expect(mockClient.updateUser).toHaveBeenCalledWith(1, {
      first_name: 'Jane',
      last_name: 'Smith',
    });
  });

  it('should update a user role via --role', async () => {
    await usersCommand.parseAsync(['node', 'test', 'update', '1', '--role', '34']);

    expect(mockClient.updateUser).toHaveBeenCalledWith(1, {
      roles: [{ role_id: 34 }],
    });
  });

  it('should archive a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'archive', '1']);

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, undefined);
  });

  it('should unarchive a user', async () => {
    await usersCommand.parseAsync(['node', 'test', 'archive', '1', '--unarchive']);

    expect(mockClient.archiveUser).toHaveBeenCalledWith(1, true);
  });
});
