import { splitFrontmatter } from './frontmatter.js';
import {
  findJsonFenceBody,
  matchCustomFields,
  matchListItem,
  matchVariantKeyValue,
} from './scan.js';

export interface VariantTemplate {
  variant?: number;
  name: string;
  config?: string;
  screenshot?: string;
  screenshot_id?: number;
  screenshot_label?: string;
}

export interface ExperimentTemplate {
  name?: string;
  display_name?: string;
  type?: string;
  state?: string;
  percentage_of_traffic?: number;
  percentages?: string;
  unit_type?: string;
  application?: string;
  primary_metric?: string;
  secondary_metrics?: string[];
  guardrail_metrics?: string[];
  exploratory_metrics?: string[];
  owners?: string[];
  owner_id?: number;
  teams?: string[];
  tags?: string[];
  audience?: string;
  variants?: VariantTemplate[];
  custom_fields?: Record<string, string>;
  analysis_type?: string;
  required_alpha?: string;
  required_power?: string;
  baseline_participants?: string;
  minimum_detectable_effect?: string;
  baseline_primary_metric_mean?: string;
  baseline_primary_metric_stdev?: string;
  group_sequential_futility_type?: string;
  group_sequential_analysis_count?: string;
  group_sequential_min_analysis_interval?: string;
  group_sequential_first_analysis_interval?: string;
  group_sequential_max_duration_interval?: string;
  note?: string;
}

/**
 * Largest template accepted, in UTF-16 code units. Real templates are a few
 * KB; inline data: screenshots can add a few MB. Every stage below is linear,
 * so this only caps the memory a single untrusted template can claim.
 */
export const MAX_TEMPLATE_LENGTH = 10 * 1024 * 1024;

export function parseExperimentMarkdown(content: string): ExperimentTemplate {
  if (content.length > MAX_TEMPLATE_LENGTH) {
    throw new Error(
      `Template content is ${content.length} characters; the limit is ${MAX_TEMPLATE_LENGTH}`
    );
  }
  let data: Record<string, unknown>;
  let markdownContent: string;
  try {
    const parsed = splitFrontmatter(content);
    data = parsed.data;
    markdownContent = parsed.content;
  } catch (error) {
    throw new Error(
      `Invalid YAML frontmatter in template content\n` +
        `${error instanceof Error ? error.message : error}`
    );
  }

  const template: ExperimentTemplate = {
    type: 'test',
    percentages: '50/50',
    variants: [],
    custom_fields: {},
  };

  const sections: Record<string, string> = {};
  let currentSection = '';
  const lines = markdownContent.split('\n');

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      sections[currentSection] = '';
      continue;
    }

    if (currentSection) {
      sections[currentSection] += line + '\n';
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    (template as Record<string, unknown>)[key] = value;
  }

  template.custom_fields = { ...template.custom_fields };

  const knownBodySections = new Set(['Variants', 'Audience']);

  for (const [sectionName, sectionContent] of Object.entries(sections)) {
    if (sectionName === 'Variants' && sectionContent.includes('###')) {
      template.variants = parseVariants(sectionContent);
      continue;
    }

    if (sectionName === 'Audience') {
      const audience = findJsonFenceBody(sectionContent);
      if (audience) {
        template.audience = audience.trim();
      }
      continue;
    }

    if (!knownBodySections.has(sectionName)) {
      if (sectionContent.includes('###')) {
        // Merge in place: spreading into a new object per section is quadratic
        // in the number of sections.
        Object.assign(template.custom_fields!, parseCustomFields(sectionContent));
      } else {
        // `\w` already includes `_`; the old `(\w+(?:_\w+)*)` matched the same
        // keys but backtracked exponentially on `a_a_a_..._a` lines with no colon.
        const keyValuePattern = /^(\w+):[^\S\n]*(.*)$/gm;
        let match;
        while ((match = keyValuePattern.exec(sectionContent)) !== null) {
          const matchedKey = match[1];
          const matchedValue = match[2];
          if (matchedKey) {
            const key = matchedKey.toLowerCase();
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            const value = matchedValue ? matchedValue.trim() : '';
            if (value) {
              (template as Record<string, unknown>)[key] = value;
            } else {
              const listItems = parseInlineList(sectionContent, match.index + match[0].length);
              if (listItems.length > 0) {
                (template as Record<string, unknown>)[key] = listItems;
              }
            }
          }
        }
      }
    }
  }

  if (template.percentage_of_traffic !== undefined) {
    template.percentage_of_traffic = parseTrafficPercentage(template.percentage_of_traffic);
  }

  return template;
}

// Section values are plain text, unlike YAML frontmatter. The API types
// percentage_of_traffic as an integer and returns HTTP 500 for a string, so it
// is converted here and anything that is not a whole number is rejected.
function parseTrafficPercentage(value: unknown): number {
  const text = String(value).trim();
  const parsed = Number(text);
  if (!/^\d+$/.test(text) || parsed > 100) {
    throw new Error(`percentage_of_traffic must be a whole number from 0 to 100, got "${text}"`);
  }
  return parsed;
}

function parseInlineList(content: string, startOffset: number): string[] {
  const items: string[] = [];
  let lineStart = startOffset;
  while (lineStart <= content.length) {
    const newline = content.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const line = content.slice(lineStart, lineEnd);
    const item = matchListItem(line);
    if (item) {
      items.push(item.trim());
    } else if (line.trim() !== '') {
      break;
    }
    lineStart = lineEnd + 1;
  }
  return items;
}

function parseVariants(content: string): VariantTemplate[] {
  const variants: VariantTemplate[] = [];

  for (const { variantNum, lines } of splitVariantSections(content)) {
    const variant: VariantTemplate = {
      variant: variantNum,
      name: `variant_${variantNum}`,
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const configKey = matchVariantKeyValue(line);
      if (configKey && configKey[0].toLowerCase() === 'config') {
        const block = readConfigBlock(lines, i, configKey[1].trim(), variantNum);
        if (block) {
          variant.config = block.config;
          i = block.lastLine;
          continue;
        }
      }

      const imageMatch = /^!\[([^\]]*)\]\((.+)\)$/.exec(line.trim());
      if (imageMatch) {
        const alt = imageMatch[1] ?? '';
        const path = imageMatch[2] ?? '';
        if (path) {
          variant.screenshot = path;
          if (alt) variant.screenshot_label = alt;
        }
        continue;
      }

      const keyValueMatch = matchVariantKeyValue(line);
      if (keyValueMatch) {
        const [matchedKey, matchedValue] = keyValueMatch;
        if (matchedValue) {
          const key = matchedKey.toLowerCase();
          const value = matchedValue.trim();
          if (key === 'name') variant.name = value;
          else if (key === 'config') variant.config = value;
          else if (key === 'screenshot') variant.screenshot = value;
          else if (key === 'screenshot_id') {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) variant.screenshot_id = parsed;
          }
        }
      }
    }

    variants.push(variant);
  }

  return variants;
}

function countLeadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line.charAt(n) === ' ') n++;
  return n;
}

/**
 * Splits the Variants section into `### variant_N` bodies, as lines with any
 * trailing `\r` removed. A body ends at the next line that starts with `###`,
 * so `###` inside a config value does not cut the variant short.
 */
function splitVariantSections(content: string): Array<{ variantNum: number; lines: string[] }> {
  const HEADING = '### variant_';
  const sections: Array<{ variantNum: number; lines: string[] }> = [];
  let current: { variantNum: number; lines: string[] } | undefined;
  const flush = () => {
    if (current && current.lines.some((l) => l.trim() !== '')) sections.push(current);
    current = undefined;
  };

  for (const rawLine of content.split('\n')) {
    let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    // Markdown allows up to three spaces of indentation before a heading.
    const indent = countLeadingSpaces(line);
    if (indent > 3 || !line.startsWith('###', indent)) {
      current?.lines.push(line);
      continue;
    }
    line = line.slice(indent);
    flush();
    if (!line.startsWith(HEADING)) continue;
    let end = HEADING.length;
    while (end < line.length && line.charAt(end) >= '0' && line.charAt(end) <= '9') end++;
    if (end > HEADING.length && line.slice(end).trim() === '') {
      current = { variantNum: parseInt(line.slice(HEADING.length, end), 10), lines: [] };
    }
  }
  flush();
  return sections;
}

/**
 * Reads a variant `config:` value that spans more than one line, either as a
 * fenced code block on the lines after an empty `config:`, or as a bare JSON
 * object/array that opens on the `config:` line and closes on a later one.
 * Returns undefined when the value is a normal single-line config (or absent),
 * so the caller falls back to single-line handling.
 */
function readConfigBlock(
  lines: string[],
  keyLine: number,
  value: string,
  variantNum: number
): { config: string; lastLine: number } | undefined {
  if (value === '') {
    let fenceLine = keyLine + 1;
    while (fenceLine < lines.length && lines[fenceLine]!.trim() === '') fenceLine++;
    if (fenceLine >= lines.length) return undefined;
    const opening = lines[fenceLine]!.trim();
    const fenceLength = countBackticks(opening, 0);
    // A backtick fence is at least three backticks, and its info string
    // (`json`) may not contain backticks.
    if (fenceLength < 3 || opening.includes('`', fenceLength)) return undefined;
    for (let end = fenceLine + 1; end < lines.length; end++) {
      const closing = lines[end]!.trim();
      if (closing.length >= fenceLength && countBackticks(closing, 0) === closing.length) {
        return {
          config: lines
            .slice(fenceLine + 1, end)
            .join('\n')
            .trim(),
          lastLine: end,
        };
      }
    }
    throw new Error(`Template variant_${variantNum}: config code fence is not closed`);
  }

  if (value[0] !== '{' && value[0] !== '[') return undefined;
  const closing = findJsonValueEnd(value, lines, keyLine + 1);
  if (closing === keyLine) return undefined;
  if (closing === -1) {
    // Reading on to the end of the variant would swallow its other keys and
    // report the JSON error against the wrong name, so fail here instead.
    throw new Error(
      `Invalid JSON in template variant_${variantNum} config: the ${value[0]} that ` +
        `opens on the config: line is never closed`
    );
  }
  return {
    config: [value, ...lines.slice(keyLine + 1, closing + 1)].join('\n').trim(),
    lastLine: closing,
  };
}

/**
 * Index of the line on which the JSON object/array starting at the beginning
 * of `first` (the rest of line `from - 1`) closes, scanning on through
 * `lines[from..]`, or -1 if it never does. Brackets inside strings are ignored.
 */
function findJsonValueEnd(first: string, lines: string[], from: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let n = from - 1; n < lines.length; n++) {
    const line = n === from - 1 ? first : lines[n]!;
    // JSON strings cannot span lines, so an unclosed quote is a syntax error
    // on its own line rather than a reason to swallow the lines after it.
    inString = false;
    escaped = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line.charAt(c);
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) return n;
      }
    }
  }
  return -1;
}

function countBackticks(text: string, from: number): number {
  let i = from;
  while (i < text.length && text.charAt(i) === '`') i++;
  return i - from;
}

function parseCustomFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [matchedName, matchedValue] of matchCustomFields(content)) {
    if (matchedName && matchedValue) {
      const fieldName = matchedName.trim();
      const fieldValue = matchedValue.trim();
      fields[fieldName] = fieldValue;
    }
  }

  return fields;
}
