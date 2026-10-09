import Table from 'cli-table3';
import yaml from 'js-yaml';
import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { highlight } from 'cli-highlight';

const terminalMarked = new Marked(
  markedTerminal({
    code: (code: string, lang: string) => {
      try {
        return highlight(code, { language: lang || 'text', ignoreIllegals: true }) + '\n';
      } catch {
        return chalk.yellow(code) + '\n';
      }
    },
    blockquote: (text: string) => {
      const lines = text.trim().split('\n');
      return (
        lines
          .map((line) => chalk.gray('│ ') + chalk.italic(line.replace(/^ {1,4}/, '')))
          .join('\n') + '\n'
      );
    },
  } as any) as any
);

export type OutputFormat =
  | 'table'
  | 'json'
  | 'yaml'
  | 'plain'
  | 'markdown'
  | 'rendered'
  | 'template'
  | 'vertical'
  | 'ids';

export interface OutputOptions {
  format?: OutputFormat;
  noColor?: boolean;
  full?: boolean;
  terse?: boolean;
}

export interface TableColumn {
  header: string;
  key: string;
  width?: number;
  truncate?: boolean;
}

export function formatOutput(
  data: unknown,
  format: OutputFormat = 'table',
  options: OutputOptions = {}
): string {
  const opts = { ...options, format };
  switch (format) {
    case 'json': {
      const json = JSON.stringify(data, null, 2);
      return options.noColor ? json : highlight(json, { language: 'json', ignoreIllegals: true });
    }
    case 'yaml': {
      const yml = yaml.dump(data, { indent: 2, lineWidth: 120 });
      return options.noColor ? yml : highlight(yml, { language: 'yaml', ignoreIllegals: true });
    }
    case 'plain':
      return formatPlain(data, opts);
    case 'markdown':
      return formatMarkdown(data, opts);
    case 'rendered':
      return (terminalMarked.parse(formatMarkdown(data, opts)) as string)
        .replace(/^( *)(\* )/gm, '$1● ')
        .trim();
    case 'vertical':
      return formatVertical(data, opts);
    case 'ids':
      if (Array.isArray(data)) {
        return data.map((item) => (item as Record<string, unknown>).id).join('\n');
      }
      return String((data as Record<string, unknown>).id);
    case 'table':
    default:
      return formatTable(data, opts);
  }
}

// Rows can carry different optional fields (e.g. --show columns absent on some
// rows), so columns come from every row, in first-seen order.
function unionKeys(rows: unknown[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (typeof row === 'object' && row !== null) {
      for (const key of Object.keys(row)) keys.add(key);
    }
  }
  return [...keys];
}

export function formatTable(data: unknown, options: OutputOptions = {}): string {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return 'No results found.';
    }

    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null) {
      return formatPlain(data, options);
    }

    const keys = unionKeys(data);
    const table = new Table({
      head: keys.map((k) => (options.noColor ? k : chalk.bold(k))),
      style: {
        head: options.noColor ? [] : ['cyan'],
        border: options.noColor ? [] : ['gray'],
      },
    });

    for (const item of data) {
      const row = keys.map((key) => {
        const value = (item as Record<string, unknown>)[key];
        return formatValue(value, options);
      });
      table.push(row);
    }

    return table.toString();
  } else if (typeof data === 'object' && data !== null) {
    const table = new Table({
      style: {
        head: options.noColor ? [] : ['cyan'],
        border: options.noColor ? [] : ['gray'],
      },
    });

    for (const [key, value] of Object.entries(data)) {
      table.push({
        [options.noColor ? key : chalk.bold(key)]: formatValue(value, options),
      });
    }

    return table.toString();
  }

  return String(data);
}

export function formatPlain(data: unknown, options: OutputOptions = {}): string {
  if (Array.isArray(data)) {
    const keys = unionKeys(data);
    return data
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return keys
            .map((key) => formatValue((item as Record<string, unknown>)[key], options))
            .join('\t');
        }
        return formatValue(item, options);
      })
      .join('\n');
  } else if (typeof data === 'object' && data !== null) {
    return Object.entries(data)
      .map(([key, value]) => `${key}\t${formatValue(value, options)}`)
      .join('\n');
  }

  return String(data);
}

export function formatMarkdown(data: unknown, options: OutputOptions = {}): string {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return 'No results found.';
    }

    const firstItem = data[0];
    if (typeof firstItem !== 'object' || firstItem === null) {
      return data.map((item) => formatValue(item, options)).join('\n');
    }

    const keys = unionKeys(data);
    let output = '| ' + keys.join(' | ') + ' |\n';
    output += '| ' + keys.map(() => '---').join(' | ') + ' |\n';

    for (const item of data) {
      const row = keys.map((key) => {
        const value = (item as Record<string, unknown>)[key];
        return formatValue(value, { ...options, full: true });
      });
      output += '| ' + row.join(' | ') + ' |\n';
    }

    return output;
  } else if (typeof data === 'object' && data !== null) {
    let output = '';
    for (const [key, value] of Object.entries(data)) {
      output += `- **${key}**: ${formatValue(value, options)}\n`;
    }
    return output;
  }

  return String(data);
}

export function formatVertical(data: unknown, options: OutputOptions = {}): string {
  const renderRow = (key: string, value: unknown, maxKeyLen: number): string => {
    const label = options.noColor ? key.padStart(maxKeyLen) : chalk.bold(key.padStart(maxKeyLen));
    const formatted = formatValue(value, { ...options, full: true });
    if (!formatted.includes('\n')) return `${label}: ${formatted}`;
    const indent = ' '.repeat(maxKeyLen + 2);
    return `${label}: ${formatted.split('\n').join('\n' + indent)}`;
  };

  if (Array.isArray(data)) {
    if (data.length === 0) return 'No results found.';

    return data
      .map((item, idx) => {
        const header = options.noColor
          ? `*** ${idx + 1}. row ***`
          : chalk.cyan(`*** ${idx + 1}. row ***`);

        if (typeof item !== 'object' || item === null) {
          return `${header}\n  ${formatValue(item, options)}`;
        }

        const maxKeyLen = Math.max(...Object.keys(item).map((k) => k.length));
        const lines = Object.entries(item).map(([key, value]) => renderRow(key, value, maxKeyLen));

        return `${header}\n${lines.join('\n')}`;
      })
      .join('\n\n');
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data);
    const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
    return entries.map(([key, value]) => renderRow(key, value, maxKeyLen)).join('\n');
  }

  return String(data);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatUserSummary(value: unknown): string | null {
  if (!isObject(value)) return null;
  const first = typeof value.first_name === 'string' ? value.first_name : '';
  const last = typeof value.last_name === 'string' ? value.last_name : '';
  const fullName = [first, last].filter(Boolean).join(' ');
  if (fullName) return fullName;
  if (typeof value.email === 'string' && value.email) return value.email;
  return null;
}

export function summarizeObjectValue(value: unknown): string | null {
  if (!isObject(value)) return null;
  const user = formatUserSummary(value);
  if (user !== null) return user;
  if (typeof value.name === 'string' && value.name) return value.name;
  if (typeof value.title === 'string' && value.title) return value.title;
  return null;
}

export function formatValue(value: unknown, options: OutputOptions = {}): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const text = truncateText(value, options);
    if (options.format === 'markdown') {
      return text.replace(/\|/g, '\\|');
    }
    return text;
  }
  if (Array.isArray(value)) {
    // One item per line in cell-based formats keeps multi-value columns narrow;
    // line-oriented formats (plain, markdown) need them on a single line.
    const separator = options.format === 'table' || options.format === 'vertical' ? '\n' : ', ';
    return value.map((v) => formatValue(v, options)).join(separator);
  }
  if (isObject(value)) {
    const summary = summarizeObjectValue(value);
    if (summary !== null) return summary;
    if (options.format === 'table' || options.format === 'vertical') {
      return JSON.stringify(value, null, 2);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function truncateText(text: string, options: OutputOptions = {}): string {
  if (options.full) {
    return text;
  }

  if (text.includes('\x1b]') || text.includes('\x1b_')) {
    return text;
  }

  const maxLength = options.terse ? 50 : 100;
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}

type ChalkColor =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'cyan'
  | 'magenta'
  | 'white'
  | 'gray'
  | 'grey';

const CHALK_COLORS: Record<ChalkColor, (text: string) => string> = {
  red: chalk.red,
  green: chalk.green,
  yellow: chalk.yellow,
  blue: chalk.blue,
  cyan: chalk.cyan,
  magenta: chalk.magenta,
  white: chalk.white,
  gray: chalk.gray,
  grey: chalk.grey,
};

export function colorize(text: string, color: string, noColor = false): string {
  if (noColor) return text;

  const colorFn = CHALK_COLORS[color as ChalkColor];
  if (!colorFn) {
    if (process.env.DEBUG) {
      console.warn(`Unknown color: ${color}, using default`);
    }
    return text;
  }

  return colorFn(text);
}
