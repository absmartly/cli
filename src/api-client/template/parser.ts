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
  const variantPattern = /### variant_(\d+)\s*\n([\s\S]*?)(?=###|$)/g;
  let match;

  while ((match = variantPattern.exec(content)) !== null) {
    const variantNumStr = match[1];
    const variantContent = match[2];
    if (!variantNumStr || !variantContent) {
      continue;
    }

    const variantNum = parseInt(variantNumStr, 10);
    const variant: VariantTemplate = {
      variant: variantNum,
      name: `variant_${variantNum}`,
    };

    const lines = variantContent.split('\n');
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
    if (fenceLine >= lines.length || !lines[fenceLine]!.trim().startsWith('```')) {
      return undefined;
    }
    for (let end = fenceLine + 1; end < lines.length; end++) {
      if (lines[end]!.trim() === '```') {
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
  const closing = findJsonValueEnd([value, ...lines.slice(keyLine + 1)]);
  if (closing === 0) return undefined;
  // Unbalanced: keep everything to the end of the variant so the payload
  // builder reports the invalid JSON with the variant's name.
  const lastLine = closing === -1 ? lines.length - 1 : keyLine + closing;
  return {
    config: [value, ...lines.slice(keyLine + 1, lastLine + 1)].join('\n').trim(),
    lastLine,
  };
}

/**
 * Index of the line on which the JSON object/array starting at the beginning
 * of `lines[0]` closes, or -1 if it never does. Brackets inside strings are
 * ignored.
 */
function findJsonValueEnd(lines: string[]): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
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
