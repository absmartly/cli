import { describe, it, expect } from 'vitest';
import { splitFrontmatter } from './frontmatter.js';
import { parseExperimentMarkdown } from './parser.js';
import { allStrings } from '../../test/helpers/differential.js';

describe('splitFrontmatter', () => {
  it('splits YAML frontmatter from the body', () => {
    expect(splitFrontmatter('---\nname: exp\nowners: [a, b]\n---\n\n## Body\n')).toEqual({
      data: { name: 'exp', owners: ['a', 'b'] },
      content: '\n## Body\n',
    });
  });

  it('returns the input as content when there is no frontmatter', () => {
    expect(splitFrontmatter('## Body\n')).toEqual({ data: {}, content: '## Body\n' });
    expect(splitFrontmatter('----\nname: x\n----\n').data).toEqual({});
  });

  it('accepts an explicit yaml language and a BOM', () => {
    expect(splitFrontmatter('﻿---yaml\nname: exp\n---\n').data).toEqual({ name: 'exp' });
    expect(splitFrontmatter('---yml\nname: exp\n---\n').data).toEqual({ name: 'exp' });
  });

  it('treats a comment-only or empty block as no data', () => {
    expect(splitFrontmatter('---\n# just a comment\n---\nbody').data).toEqual({});
    expect(splitFrontmatter('---\n---\nbody')).toEqual({ data: {}, content: 'body' });
  });

  it('rejects ---js frontmatter without evaluating it', () => {
    const marker = globalThis as { templateFrontmatterEvaluated?: boolean };
    delete marker.templateFrontmatterEvaluated;
    for (const language of ['js', 'javascript', 'JS', 'coffee', 'json']) {
      const md = `---${language}\n{ name: (globalThis.templateFrontmatterEvaluated = true, "x") }\n---\n`;
      expect(() => splitFrontmatter(md)).toThrow(/only YAML is allowed/);
      expect(() => parseExperimentMarkdown(md)).toThrow(/Invalid YAML frontmatter/);
    }
    expect(marker.templateFrontmatterEvaluated).toBeUndefined();
  });

  it('does not construct JS types from YAML tags', () => {
    expect(() => splitFrontmatter('---\nf: !!js/function "function () {}"\n---\n')).toThrow();
  });

  it('rejects YAML alias bombs', () => {
    const layers = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 9; i++) {
      const prev = String.fromCharCode(96 + i);
      const name = String.fromCharCode(97 + i);
      layers.push(`${name}: &${name} [${Array(10).fill(`*${prev}`).join(', ')}]`);
    }
    const start = performance.now();
    expect(() => splitFrontmatter(`---\n${layers.join('\n')}\n---\n`)).toThrow(/expands to more/);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('allows aliases of plain values', () => {
    expect(splitFrontmatter('---\nname: &n exp\ndisplay_name: *n\n---\n').data).toEqual({
      name: 'exp',
      display_name: 'exp',
    });
  });

  it('stays linear on whitespace-heavy frontmatter', () => {
    const start = performance.now();
    expect(splitFrontmatter('---\n' + '\n'.repeat(200_000) + 'a: 1\n---\n').data).toEqual({ a: 1 });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('splits on the same delimiters gray-matter did', () => {
    // Delimiter handling copied from gray-matter 4.0.3, which this replaced.
    const grayMatterSplit = (input: string) => {
      const str = input.charAt(0) === '﻿' ? input.slice(1) : input;
      if (!str.startsWith('---') || str.charAt(3) === '-') return { block: null, content: str };
      let rest = str.slice(3);
      const language = rest.slice(0, rest.search(/\r?\n/));
      if (language.trim()) rest = rest.slice(language.length);
      let closeIndex = rest.indexOf('\n---');
      if (closeIndex === -1) closeIndex = rest.length;
      let content = closeIndex === rest.length ? '' : rest.slice(closeIndex + 4);
      if (content[0] === '\r') content = content.slice(1);
      if (content[0] === '\n') content = content.slice(1);
      return { block: rest.slice(0, closeIndex), content, language: language.trim() };
    };
    const tokens = ['---', '-', '\n', '\r', 'yaml', ' ', 'a', '﻿'];
    let checked = 0;
    for (const input of allStrings(tokens, 5)) {
      const expected = grayMatterSplit(input);
      if (expected.language && !['yaml', 'yml'].includes(expected.language.toLowerCase())) {
        continue;
      }
      let actual: string;
      try {
        actual = splitFrontmatter(input).content;
      } catch {
        // Only the YAML parse can throw here; the split itself matched.
        continue;
      }
      expect({ input, content: actual }).toEqual({ input, content: expected.content });
      checked++;
    }
    expect(checked).toBeGreaterThan(5_000);
  });
});
