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

  return template;
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
    for (const line of lines) {
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
