import chalk from 'chalk';
import type { Command } from 'commander';

export function addPaginationOptions(command: Command, defaultItems = 20): Command {
  return command
    .option('--items <number>', 'results per page', (v: string) => parseInt(v, 10), defaultItems)
    .option('--page <number>', 'page number', (v: string) => parseInt(v, 10), 1);
}

export function printPaginationFooter(
  count: number,
  items: number,
  page: number,
  outputFormat?: string
): void {
  if (outputFormat === 'json' || outputFormat === 'yaml') return;
  const hasMore = count >= items;
  const footer = hasMore
    ? `Page ${page} (${count} results). Next: --page ${page + 1}`
    : `Page ${page} (${count} results).`;
  console.log(chalk.gray(footer));
}

export function printFilteredFooter(
  count: number,
  outputFormat?: string,
  page?: number,
  items?: number
): void {
  if (outputFormat === 'json' || outputFormat === 'yaml') return;
  let footer = `${count} result${count === 1 ? '' : 's'} (filtered).`;
  if (page !== undefined && items !== undefined && count > items) {
    const totalPages = Math.max(1, Math.ceil(count / items));
    footer = `${count} results (filtered) — page ${page}/${totalPages}.`;
    if (page < totalPages) footer += ` Next: --page ${page + 1}`;
  }
  console.log(chalk.gray(footer));
}

export function printMetricFooter(
  total: number,
  metricName: string,
  metricId: number,
  page: number,
  items: number,
  outputFormat?: string
): void {
  if (outputFormat === 'json' || outputFormat === 'yaml') return;
  const verb = total === 1 ? 'experiment uses' : 'experiments use';
  let footer = `${total} ${verb} metric "${metricName}" (#${metricId})`;
  if (total > items) {
    const totalPages = Math.max(1, Math.ceil(total / items));
    footer += ` — page ${page}/${totalPages}`;
  }
  console.log(chalk.gray(footer));
}
