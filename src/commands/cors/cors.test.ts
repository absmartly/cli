import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { corsCommand } from './index.js';
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

describe('cors command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listCorsOrigins: vi.fn().mockResolvedValue([{ id: 1, origin: 'https://example.com' }]),
    getCorsOrigin: vi.fn().mockResolvedValue({ id: 1, origin: 'https://example.com' }),
    createCorsOrigin: vi.fn().mockResolvedValue({ id: 2, origin: 'https://new.com' }),
    updateCorsOrigin: vi.fn().mockResolvedValue({ id: 1, origin: 'https://updated.com' }),
    deleteCorsOrigin: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(corsCommand);
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

  it('should list CORS origins', async () => {
    await corsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listCorsOrigins).toHaveBeenCalledWith({ items: 20, page: 1 });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list CORS origins with pagination', async () => {
    await corsCommand.parseAsync(['node', 'test', 'list', '--items', '10', '--page', '2']);

    expect(mockClient.listCorsOrigins).toHaveBeenCalledWith({ items: 10, page: 2 });
  });

  it('should get CORS origin by id', async () => {
    await corsCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getCorsOrigin).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create a CORS origin', async () => {
    await corsCommand.parseAsync(['node', 'test', 'create', '--origin', 'https://new.com']);

    expect(mockClient.createCorsOrigin).toHaveBeenCalledWith({ origin: 'https://new.com' });
  });

  it('should update a CORS origin', async () => {
    await corsCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--origin',
      'https://updated.com',
    ]);

    expect(mockClient.updateCorsOrigin).toHaveBeenCalledWith(1, { origin: 'https://updated.com' });
  });

  it('should delete a CORS origin', async () => {
    await corsCommand.parseAsync(['node', 'test', 'delete', '1']);

    expect(mockClient.deleteCorsOrigin).toHaveBeenCalledWith(1);
  });
});
