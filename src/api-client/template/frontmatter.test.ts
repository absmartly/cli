import { describe, it, expect } from 'vitest';
import { splitFrontmatter } from './frontmatter.js';
import { parseExperimentMarkdown } from './parser.js';
import { allStrings } from '../../test/helpers/differential.js';
import { bySize, expectCostWithin, expectLinear } from '../../test/helpers/timing.js';

const ANCHORS_REJECTED = /anchors and aliases are not supported/;

// Anchors are rejected when their node closes, before any alias resolves, so
// the work is bounded by the input scanned. Before that, the alias bomb below
// took ~13 s to expand and `width` self-aliases ~2 s at 30k, so a generous
// bound still proves the fix without depending on runner speed.
function expectFastThrow(md: string): void {
  const start = performance.now();
  expect(() => splitFrontmatter(md)).toThrow(ANCHORS_REJECTED);
  expect(performance.now() - start).toBeLessThan(1_000);
}

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

  it('rejects YAML alias bombs before expanding them', () => {
    const layers = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 9; i++) {
      const prev = String.fromCharCode(96 + i);
      const name = String.fromCharCode(97 + i);
      layers.push(`${name}: &${name} [${Array(10).fill(`*${prev}`).join(', ')}]`);
    }
    expectFastThrow(`---\n${layers.join('\n')}\n---\n`);
  });

  it('rejects cyclic aliases', () => {
    const md = bySize((width) => `---\na: &a [${Array(width).fill('*a').join(',')}]\n---\n`);
    for (const width of [100, 300, 30_000]) expectFastThrow(md(width));
    // Rejection work grows with the aliases scanned, not with their expansion.
    expectLinear(
      (width) => expect(() => splitFrontmatter(md(width))).toThrow(ANCHORS_REJECTED),
      7_500
    );
  });

  it('rejects a long string aliased into many places', () => {
    // The anchor fails as soon as its node closes, before any alias is read.
    const md = bySize((n) => {
      const refs = Array.from({ length: n }, (_, i) => `  - name: v${i}\n    config: *c`);
      return `---\nc: &c "${'x'.repeat(2 * n)}"\nvariants:\n${refs.join('\n')}\n---\n`;
    });
    expectFastThrow(md(50_000));
    expectLinear((n) => expect(() => splitFrontmatter(md(n))).toThrow(ANCHORS_REJECTED), 12_500);
  });

  it('stops loading frontmatter past the node budget', () => {
    const md = bySize(
      (n) => `---\n${Array.from({ length: n }, (_, i) => `k${i}: 1`).join('\n')}\n---\n`
    );
    // ~9 MB of distinct keys, near the 10M-character template cap.
    expect(() => splitFrontmatter(md(600_000))).toThrow(/more than 50000 YAML nodes/);
    // The load stops at the budget, so 4x the keys costs little more than
    // the scan for the closing delimiter (~1.3x). Without the budget js-yaml
    // loads every key, which is linear but grows ~4x (~0.6 s at 600k), so a
    // 2.5x bound tells the two apart on any runner.
    expectLinear((n) => expect(() => splitFrontmatter(md(n))).toThrow(), 150_000, {
      maxRatio: 2.5,
      floorMs: 10,
    });
  });

  it('accepts a large realistic frontmatter under the node budget', () => {
    const metrics = Array.from({ length: 2_000 }, (_, i) => `  - metric_${i}`).join('\n');
    const { data } = splitFrontmatter(`---\nname: e\nsecondary_metrics:\n${metrics}\n---\n`);
    expect(data.secondary_metrics).toHaveLength(2_000);
  });

  it('rejects anchors on scalars and inside flow collections', () => {
    expectFastThrow('---\nname: &n exp\ndisplay_name: *n\n---\n');
    expectFastThrow('---\na: [&q 1, *q]\n---\n');
    expectFastThrow('---\na: &unused 1\n---\n');
  });

  it('rejects !!omap without running its quadratic duplicate-key check', () => {
    // The node budget caps an !!omap at ~12k entries (4 nodes each), which
    // took ~25 ms with js-yaml's quadratic resolver; reject the tag anyway so
    // the budget is not the only thing standing between it and 40k (~1 s).
    // Loading the same 12k entries untagged is the baseline: the rejected
    // !!omap costs ~1.3x that, while running the resolver costs ~8x.
    const entries = Array.from({ length: 12_000 }, (_, i) => `  - k${i}: 1`).join('\n');
    const omap = `---\nx: !!omap\n${entries}\n---\n`;
    const plain = `---\nx:\n${entries}\n---\n`;
    expect(() => splitFrontmatter(omap)).toThrow(/!!omap is not supported/);
    expectCostWithin(
      () => expect(() => splitFrontmatter(omap)).toThrow(),
      () => splitFrontmatter(plain)
    );
  });

  it('keeps & and * inside values', () => {
    expect(splitFrontmatter('---\na: "&x"\nb: x&y*z\nc: "*c"\n---\n').data).toEqual({
      a: '&x',
      b: 'x&y*z',
      c: '*c',
    });
  });

  it('stays linear on whitespace-heavy frontmatter', () => {
    const md = (n: number) => '---\n' + '\n'.repeat(n) + 'a: 1\n---\n';
    expect(splitFrontmatter(md(200_000)).data).toEqual({ a: 1 });
    expectLinear((n) => splitFrontmatter(md(n)), 50_000);
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
