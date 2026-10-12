import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authCommand } from './index.js';
import * as config from '../../lib/config/config.js';
import * as keyring from '../../lib/config/keyring.js';
import {
  getAPIClientFromOptions,
  getGlobalOptions,
  printFormatted,
} from '../../lib/utils/api-helper.js';
import { createAPIClient } from '../../lib/api/client.js';
import { startOAuthFlow } from '../../lib/auth/oauth.js';
import { resetCommand } from '../../test/helpers/command-reset.js';

vi.mock('../../lib/config/config.js');
vi.mock('../../lib/config/keyring.js');
vi.mock('../../lib/utils/api-helper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/utils/api-helper.js')>();
  return {
    ...actual,
    getAPIClientFromOptions: vi.fn(),
    getGlobalOptions: vi.fn(),
    printFormatted: vi.fn(),
    resolveAPIKey: vi.fn().mockResolvedValue('test-key'),
    resolveEndpoint: vi.fn().mockReturnValue('https://api.example.com/v1'),
  };
});
vi.mock('../../lib/auth/oauth.js');
vi.mock('@inquirer/prompts');
vi.mock('../../lib/api/client.js');

describe('auth status command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('API key display security', () => {
    beforeEach(() => {
      vi.mocked(config.loadConfig).mockReturnValue({
        'default-profile': 'default',
        profiles: {
          default: {
            api: { endpoint: 'https://api.example.com' },
            expctld: { endpoint: 'https://ctl.example.com' },
          },
        },
      });

      vi.mocked(config.getProfile).mockReturnValue({
        api: { endpoint: 'https://api.example.com' },
        expctld: { endpoint: 'https://ctl.example.com' },
      });
    });

    it('should show masked key with last 4 chars by default', async () => {
      vi.mocked(keyring.getAPIKey).mockResolvedValue('sk-1234567890abcdef');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const statusCmd = authCommand.commands.find((cmd) => cmd.name() === 'status');
      await statusCmd?.parseAsync(['node', 'test'], { from: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith('API Key: ****...cdef');

      consoleSpy.mockRestore();
    });

    it('should show full key with --show-full-key flag', async () => {
      vi.mocked(keyring.getAPIKey).mockResolvedValue('sk-1234567890abcdef');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const statusCmd = authCommand.commands.find((cmd) => cmd.name() === 'status');
      await statusCmd?.parseAsync(['node', 'test', '--show-full-key'], { from: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith('API Key: sk-1234567890abcdef');

      consoleSpy.mockRestore();
    });

    it('should show "not set" when no API key exists', async () => {
      vi.mocked(keyring.getAPIKey).mockResolvedValue(null);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const statusCmd = authCommand.commands.find((cmd) => cmd.name() === 'status');
      await statusCmd?.parseAsync(['node', 'test'], { from: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith('API Key: not set');

      consoleSpy.mockRestore();
    });
  });
});

describe('auth API key management', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    getCurrentUser: vi
      .fn()
      .mockResolvedValue({ id: 1, email: 'test@test.com', first_name: 'Test', last_name: 'User' }),
    listUserApiKeys: vi.fn().mockResolvedValue([{ id: 1, name: 'key1' }]),
    getUserApiKey: vi.fn().mockResolvedValue({ id: 1, name: 'key1' }),
    createUserApiKey: vi.fn().mockResolvedValue({ id: 2, name: 'new', key: 'secret' }),
    updateUserApiKey: vi.fn().mockResolvedValue({ id: 1, name: 'updated' }),
    deleteUserApiKey: vi.fn().mockResolvedValue(undefined),
    updateCurrentUser: vi
      .fn()
      .mockResolvedValue({ id: 1, email: 'test@test.com', first_name: 'New', last_name: 'Name' }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(authCommand);
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

  it('should list user API keys', async () => {
    await authCommand.parseAsync(['node', 'test', 'list-api-keys']);

    expect(mockClient.listUserApiKeys).toHaveBeenCalled();
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should get user API key by ID', async () => {
    await authCommand.parseAsync(['node', 'test', 'get-api-key', '1']);

    expect(mockClient.getUserApiKey).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should update user API key', async () => {
    await authCommand.parseAsync(['node', 'test', 'update-api-key', '1', '--name', 'Renamed']);

    expect(mockClient.updateUserApiKey).toHaveBeenCalledWith(1, { name: 'Renamed' });
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('updated');
  });

  it('should delete user API key', async () => {
    await authCommand.parseAsync(['node', 'test', 'delete-api-key', '1']);

    expect(mockClient.deleteUserApiKey).toHaveBeenCalledWith(1);
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('deleted');
  });

  it('should edit user profile', async () => {
    await authCommand.parseAsync([
      'node',
      'test',
      'edit-profile',
      '--first-name',
      'New',
      '--last-name',
      'Name',
    ]);

    expect(mockClient.updateCurrentUser).toHaveBeenCalledWith({
      first_name: 'New',
      last_name: 'Name',
    });
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('updated');
  });

  it('should show whoami output', async () => {
    await authCommand.parseAsync(['node', 'test', 'whoami']);

    expect(mockClient.getCurrentUser).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('test@test.com');
  });

  describe('reset-my-password', () => {
    it('should change password when confirmation matches', async () => {
      const { password: passwordPrompt } = await import('@inquirer/prompts');
      const mockedPassword = vi.mocked(passwordPrompt);
      mockedPassword
        .mockResolvedValueOnce('old-pass')
        .mockResolvedValueOnce('new-pass')
        .mockResolvedValueOnce('new-pass');

      await authCommand.parseAsync(['node', 'test', 'reset-my-password']);

      expect(mockClient.updateCurrentUser).toHaveBeenCalledWith({
        old_password: 'old-pass',
        new_password: 'new-pass',
      });
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Password changed successfully');
    });

    it('should error when passwords do not match', async () => {
      const { password: passwordPrompt } = await import('@inquirer/prompts');
      const mockedPassword = vi.mocked(passwordPrompt);
      mockedPassword
        .mockResolvedValueOnce('old-pass')
        .mockResolvedValueOnce('new-pass')
        .mockResolvedValueOnce('different-pass');

      await expect(authCommand.parseAsync(['node', 'test', 'reset-my-password'])).rejects.toThrow(
        'process.exit: 1'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'Passwords do not match.');
    });
  });
});

describe('auth login command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(authCommand);
    vi.mocked(keyring.setAPIKey).mockResolvedValue(undefined);
    vi.mocked(config.setProfile).mockImplementation(() => {});
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: false } as any);
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

  it.each([
    ['--api-key flow', ['--api-key', 'k', '--endpoint', 'https://api.example.com/v1']],
    ['OAuth flow', ['--endpoint', 'https://api.example.com/v1', '--oauth', '--persistent']],
  ])('refuses --dry-run before any network call or keyring write (%s)', async (_n, args) => {
    vi.mocked(getGlobalOptions).mockReturnValue({ output: 'table', dryRun: true } as any);

    await expect(authCommand.parseAsync(['node', 'test', 'login', ...args])).rejects.toThrow(
      'process.exit: 1'
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error:', 'auth login does not support --dry-run');
    expect(createAPIClient).not.toHaveBeenCalled();
    expect(startOAuthFlow).not.toHaveBeenCalled();
    expect(keyring.setAPIKey).not.toHaveBeenCalled();
    expect(keyring.setOAuthToken).not.toHaveBeenCalled();
    expect(config.setProfile).not.toHaveBeenCalled();
  });

  it('should store credentials when --api-key and --endpoint are provided', async () => {
    await authCommand.parseAsync([
      'node',
      'test',
      'login',
      '--api-key',
      'my-key',
      '--endpoint',
      'https://api.example.com/v1',
    ]);

    expect(keyring.setAPIKey).toHaveBeenCalledWith('my-key', 'default');
    expect(config.setProfile).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Logged in successfully');
  });

  it('should error when --api-key is provided but --endpoint is missing', async () => {
    await expect(
      authCommand.parseAsync(['node', 'test', 'login', '--api-key', 'my-key'])
    ).rejects.toThrow('process.exit: 1');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error:',
      '--endpoint is required when using --api-key'
    );
  });

  it('should error when both --session and --persistent are provided', async () => {
    await expect(
      authCommand.parseAsync([
        'node',
        'test',
        'login',
        '--endpoint',
        'https://api.example.com/v1',
        '--session',
        '--persistent',
      ])
    ).rejects.toThrow('process.exit: 1');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error:',
      'Cannot use both --session and --persistent'
    );
  });

  it('should log warning when getProfile throws unexpected error during login endpoint lookup', async () => {
    vi.mocked(config.getProfile).mockImplementation(() => {
      throw new Error('EACCES permission denied');
    });

    // No --endpoint provided forces it into the getProfile lookup code path
    // The unexpected error should be logged, then it will fail with "endpoint required"
    await expect(authCommand.parseAsync(['node', 'test', 'login'])).rejects.toThrow(
      'process.exit: 1'
    );

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('unexpected error reading profile');
    expect(errorOutput).toContain('EACCES permission denied');
  });

  it('should not log warning when getProfile throws "not found" during login', async () => {
    vi.mocked(config.getProfile).mockImplementation(() => {
      throw new Error('Profile "default" not found');
    });

    // Without endpoint and without profile, this will error asking for endpoint
    await expect(authCommand.parseAsync(['node', 'test', 'login'])).rejects.toThrow(
      'process.exit: 1'
    );

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).not.toContain('unexpected error');
  });
});

describe('auth logout command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(authCommand);
    vi.mocked(config.loadConfig).mockReturnValue({
      'default-profile': 'default',
      profiles: {
        default: { api: { endpoint: 'https://api.example.com' }, expctld: { endpoint: '' } },
      },
    });
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

  it('should show success when both deletions succeed', async () => {
    vi.mocked(keyring.deleteOAuthToken).mockResolvedValue(true);
    vi.mocked(keyring.deleteAPIKey).mockResolvedValue(true);

    await authCommand.parseAsync(['node', 'test', 'logout']);

    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Logged out');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should warn when OAuth token deletion fails but still show success', async () => {
    vi.mocked(keyring.deleteOAuthToken).mockRejectedValue(new Error('keyring unavailable'));
    vi.mocked(keyring.deleteAPIKey).mockResolvedValue(true);

    await authCommand.parseAsync(['node', 'test', 'logout']);

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('failed to delete OAuth token');
    expect(errorOutput).toContain('keyring unavailable');
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Logged out');
  });

  it('should warn when API key deletion fails but still show success', async () => {
    vi.mocked(keyring.deleteOAuthToken).mockResolvedValue(true);
    vi.mocked(keyring.deleteAPIKey).mockRejectedValue(new Error('disk full'));

    await authCommand.parseAsync(['node', 'test', 'logout']);

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('failed to delete API key');
    expect(errorOutput).toContain('disk full');
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).toContain('Logged out');
  });

  it('should show incomplete message when both deletions fail', async () => {
    vi.mocked(keyring.deleteOAuthToken).mockRejectedValue(new Error('oauth fail'));
    vi.mocked(keyring.deleteAPIKey).mockRejectedValue(new Error('key fail'));

    await authCommand.parseAsync(['node', 'test', 'logout']);

    const errorOutput = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('failed to delete OAuth token');
    expect(errorOutput).toContain('failed to delete API key');
    expect(errorOutput).toContain('Logout may be incomplete');
    const output = consoleSpy.mock.calls.flat().join(' ');
    expect(output).not.toContain('Logged out');
  });
});
