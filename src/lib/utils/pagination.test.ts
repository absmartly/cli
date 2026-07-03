import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  addPaginationOptions,
  printPaginationFooter,
  printMetricFooter,
  printFilteredFooter,
} from './pagination.js';

describe('addPaginationOptions', () => {
  it('should add --items and --page options to a Command', () => {
    const cmd = new Command('test');
    addPaginationOptions(cmd);

    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain('--items');
    expect(optionNames).toContain('--page');
  });

  it('should use custom default items', () => {
    const cmd = new Command('test');
    addPaginationOptions(cmd, 50);

    const itemsOpt = cmd.options.find((o) => o.long === '--items');
    expect(itemsOpt?.defaultValue).toBe(50);
  });
});

describe('printPaginationFooter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should show "Next: --page N+1" when count >= items', () => {
    printPaginationFooter(20, 20, 1);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('Next: --page 2');
  });

  it('should show just count when count < items', () => {
    printPaginationFooter(5, 20, 1);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('5 results');
    expect(output).not.toContain('Next:');
  });
});

describe('printFilteredFooter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('shows a plain count when page/items are omitted', () => {
    printFilteredFooter(5);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('5 results (filtered).');
    expect(output).not.toContain('page');
  });

  it('shows a plain count when total fits on one page', () => {
    printFilteredFooter(5, 'table', 1, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('5 results (filtered).');
    expect(output).not.toContain('page');
  });

  it('shows page X/Y and a Next hint when total exceeds one page', () => {
    printFilteredFooter(250, 'table', 2, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('250 results (filtered) — page 2/13.');
    expect(output).toContain('Next: --page 3');
  });

  it('omits the Next hint on the last page', () => {
    printFilteredFooter(40, 'table', 2, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('page 2/2');
    expect(output).not.toContain('Next:');
  });

  it('prints nothing for json/yaml output', () => {
    printFilteredFooter(250, 'json', 1, 20);
    printFilteredFooter(250, 'yaml', 1, 20);
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('printMetricFooter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('summarizes the total and the metric when everything fits on one page', () => {
    printMetricFooter(3, 'Revenue', 42, 1, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('3 experiments use metric "Revenue" (#42)');
    expect(output).not.toContain('page');
  });

  it('uses the singular form for a single match', () => {
    printMetricFooter(1, 'Revenue', 42, 1, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('1 experiment use'.replace('use', 'uses'));
    expect(output).toContain('1 experiment uses metric "Revenue" (#42)');
  });

  it('shows the page indicator when matches span multiple pages', () => {
    printMetricFooter(45, 'Revenue', 42, 2, 20);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain('page 2/3');
  });

  it('stays silent for json/yaml output', () => {
    printMetricFooter(3, 'Revenue', 42, 1, 20, 'json');
    printMetricFooter(3, 'Revenue', 42, 1, 20, 'yaml');
    expect(logSpy).not.toHaveBeenCalled();
  });
});
