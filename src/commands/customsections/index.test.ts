import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { customSectionsCommand } from './index.js';
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

describe('custom-sections command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const mockClient = {
    listCustomSections: vi.fn(),
    createCustomSection: vi.fn(),
    updateCustomSection: vi.fn(),
    archiveCustomSection: vi.fn(),
    reorderCustomSections: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetCommand(customSectionsCommand);
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

  describe('list', () => {
    it('should list all custom sections', async () => {
      mockClient.listCustomSections.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      await customSectionsCommand.parseAsync(['node', 'test', 'list']);

      expect(mockClient.listCustomSections).toHaveBeenCalledWith({
        type: undefined,
        items: 20,
        page: 1,
      });
      expect(printFormatted).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }], expect.any(Object));
    });

    it('should list custom sections with pagination', async () => {
      mockClient.listCustomSections.mockResolvedValue([]);

      await customSectionsCommand.parseAsync([
        'node',
        'test',
        'list',
        '--items',
        '10',
        '--page',
        '2',
      ]);

      expect(mockClient.listCustomSections).toHaveBeenCalledWith({
        type: undefined,
        items: 10,
        page: 2,
      });
    });
  });

  describe('create', () => {
    it('should create a custom section', async () => {
      mockClient.createCustomSection.mockResolvedValue({ id: 10, name: 'Section A' });

      await customSectionsCommand.parseAsync([
        'node',
        'test',
        'create',
        '--name',
        'Section A',
        '--type',
        'text',
      ]);

      expect(mockClient.createCustomSection).toHaveBeenCalledWith({
        name: 'Section A',
        type: 'text',
      });
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Custom section created');
    });
  });

  describe('update', () => {
    it('should update a custom section', async () => {
      mockClient.updateCustomSection.mockResolvedValue({ id: 10, name: 'Updated' });

      await customSectionsCommand.parseAsync(['node', 'test', 'update', '10', '--name', 'Updated']);

      expect(mockClient.updateCustomSection).toHaveBeenCalledWith(10, { name: 'Updated' });
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Custom section 10 updated');
    });
  });

  describe('archive', () => {
    it('should archive a custom section', async () => {
      mockClient.archiveCustomSection.mockResolvedValue(undefined);

      await customSectionsCommand.parseAsync(['node', 'test', 'archive', '10']);

      expect(mockClient.archiveCustomSection).toHaveBeenCalledWith(10, false);
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Custom section 10 archived');
    });

    it('should unarchive with --unarchive flag', async () => {
      mockClient.archiveCustomSection.mockResolvedValue(undefined);

      await customSectionsCommand.parseAsync(['node', 'test', 'archive', '10', '--unarchive']);

      expect(mockClient.archiveCustomSection).toHaveBeenCalledWith(10, true);
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Custom section 10 unarchived');
    });
  });

  describe('reorder', () => {
    it('should reorder custom sections', async () => {
      mockClient.reorderCustomSections.mockResolvedValue(undefined);

      await customSectionsCommand.parseAsync([
        'node',
        'test',
        'reorder',
        '--sections',
        '1:0,2:1,3:2',
      ]);

      expect(mockClient.reorderCustomSections).toHaveBeenCalledWith([
        { id: 1, order_index: 0 },
        { id: 2, order_index: 1 },
        { id: 3, order_index: 2 },
      ]);
      const output = consoleSpy.mock.calls.flat().join(' ');
      expect(output).toContain('Custom sections reordered');
    });
  });
});
