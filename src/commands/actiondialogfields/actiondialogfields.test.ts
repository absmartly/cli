import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actionDialogFieldsCommand } from './index.js';
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

describe('actiondialogfields command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listExperimentActionDialogFields: vi.fn().mockResolvedValue([{ id: 1 }]),
    getExperimentActionDialogField: vi.fn().mockResolvedValue({ id: 1 }),
    createExperimentActionDialogField: vi.fn().mockResolvedValue({ id: 2 }),
    updateExperimentActionDialogField: vi.fn().mockResolvedValue({ id: 1 }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(actionDialogFieldsCommand);
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

  it('should list action dialog fields', async () => {
    await actionDialogFieldsCommand.parseAsync(['node', 'test', 'list']);

    expect(mockClient.listExperimentActionDialogFields).toHaveBeenCalledWith({
      items: 20,
      page: 1,
    });
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should list action dialog fields with pagination', async () => {
    await actionDialogFieldsCommand.parseAsync([
      'node',
      'test',
      'list',
      '--items',
      '10',
      '--page',
      '2',
    ]);

    expect(mockClient.listExperimentActionDialogFields).toHaveBeenCalledWith({
      items: 10,
      page: 2,
    });
  });

  it('should get action dialog field by id', async () => {
    await actionDialogFieldsCommand.parseAsync(['node', 'test', 'get', '1']);

    expect(mockClient.getExperimentActionDialogField).toHaveBeenCalledWith(1);
    expect(printFormatted).toHaveBeenCalled();
  });

  it('should create an action dialog field', async () => {
    await actionDialogFieldsCommand.parseAsync([
      'node',
      'test',
      'create',
      '--json-config',
      '{"name":"Reason"}',
    ]);

    expect(mockClient.createExperimentActionDialogField).toHaveBeenCalledWith({ name: 'Reason' });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Action dialog field created'));
  });

  it('should update an action dialog field', async () => {
    await actionDialogFieldsCommand.parseAsync([
      'node',
      'test',
      'update',
      '1',
      '--json-config',
      '{"required":true}',
    ]);

    expect(mockClient.updateExperimentActionDialogField).toHaveBeenCalledWith(1, {
      required: true,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Action dialog field 1 updated')
    );
  });
});
