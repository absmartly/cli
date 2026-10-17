import { describe, it, expect } from 'vitest';
import { MAX_TEMPLATE_LENGTH, parseExperimentMarkdown } from './parser.js';
import { allStrings } from '../../test/helpers/differential.js';
import { bySize, expectLinear } from '../../test/helpers/timing.js';

describe('parseExperimentMarkdown', () => {
  it('should parse frontmatter fields', () => {
    const md = `---
name: my_exp
type: feature
state: running
---
`;
    const result = parseExperimentMarkdown(md);
    expect(result.name).toBe('my_exp');
    expect(result.type).toBe('feature');
    expect(result.state).toBe('running');
  });

  it('should parse key-value pairs from sections', () => {
    const md = `---
name: exp1
---

## Basic Info

display_name: My Experiment
percentage_of_traffic: 80
`;
    const result = parseExperimentMarkdown(md);
    expect(result.display_name).toBe('My Experiment');
    expect(result.percentage_of_traffic).toBe('80');
  });

  it('should parse variants', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
config: {"a":1}

### variant_1

name: treatment
config: {"a":2}
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants).toHaveLength(2);
    expect(result.variants![0].name).toBe('control');
    expect(result.variants![0].config).toBe('{"a":1}');
    expect(result.variants![1].name).toBe('treatment');
    expect(result.variants![1].variant).toBe(1);
  });

  it('should parse custom fields section', () => {
    const md = `---
name: exp1
---

## Custom Fields

### Launch Date

2026-04-01

### Reviewer

john@example.com
`;
    const result = parseExperimentMarkdown(md);
    expect(result.custom_fields).toEqual({
      'Launch Date': '2026-04-01',
      Reviewer: 'john@example.com',
    });
  });

  it('should throw on invalid YAML frontmatter', () => {
    const md = `---
: : invalid yaml
---
`;
    expect(() => parseExperimentMarkdown(md)).toThrow(/Invalid YAML frontmatter/);
  });

  it('should parse screenshot: key-value syntax', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
screenshot: /tmp/control.png

### variant_1

name: treatment
screenshot: https://example.com/treatment.png
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe('/tmp/control.png');
    expect(result.variants![0].screenshot_label).toBeUndefined();
    expect(result.variants![1].screenshot).toBe('https://example.com/treatment.png');
    expect(result.variants![1].screenshot_label).toBeUndefined();
  });

  it('should parse markdown image syntax with label', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
![Control screenshot](./screenshots/control.png)

### variant_1

name: treatment
![Treatment screenshot](./screenshots/treatment.png)
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe('./screenshots/control.png');
    expect(result.variants![0].screenshot_label).toBe('Control screenshot');
    expect(result.variants![1].screenshot).toBe('./screenshots/treatment.png');
    expect(result.variants![1].screenshot_label).toBe('Treatment screenshot');
  });

  it('should parse markdown image syntax without label', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
![](./screenshots/control.png)
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe('./screenshots/control.png');
    expect(result.variants![0].screenshot_label).toBeUndefined();
  });

  it('should parse markdown image syntax with data URI', () => {
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
![My screenshot](${dataUri})
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe(dataUri);
    expect(result.variants![0].screenshot_label).toBe('My screenshot');
  });

  it('should parse markdown image syntax with URL', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
![Hero image](https://cdn.example.com/hero.png)
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe('https://cdn.example.com/hero.png');
    expect(result.variants![0].screenshot_label).toBe('Hero image');
  });

  it('should prefer last screenshot when both syntaxes present', () => {
    const md = `---
name: exp1
---

## Variants

### variant_0

name: control
screenshot: /old/path.png
![New label](./new/path.png)
`;
    const result = parseExperimentMarkdown(md);
    expect(result.variants![0].screenshot).toBe('./new/path.png');
    expect(result.variants![0].screenshot_label).toBe('New label');
  });

  it('should default to test type and 50/50 percentages', () => {
    const md = `---
name: exp1
---
`;
    const result = parseExperimentMarkdown(md);
    expect(result.type).toBe('test');
    expect(result.percentages).toBe('50/50');
  });

  it('merges custom fields across sections, later sections winning', () => {
    const result = parseExperimentMarkdown(
      '## A\n### One\n1\n### Two\n2\n## B\n### Two\n22\n### Three\n3\n'
    );
    expect(result.custom_fields).toEqual({ One: '1', Two: '22', Three: '3' });
  });

  it('parses keys with underscores, digits and mixed case', () => {
    const md = `## Basic Info

display_name: My Experiment
Group_Sequential_Analysis_Count: 3
key_2_b:   spaced value
_leading: a
trailing_: b
9lives: c
x:
not a key: d
dash-key: e
`;
    const result = parseExperimentMarkdown(md) as Record<string, unknown>;
    expect(result).toMatchObject({
      display_name: 'My Experiment',
      group_sequential_analysis_count: '3',
      key_2_b: 'spaced value',
      _leading: 'a',
      trailing_: 'b',
      '9lives': 'c',
    });
    expect(result).not.toHaveProperty('x');
    expect(result).not.toHaveProperty('dash-key');
  });

  it('matches the same key/value lines as the old underscore-group regex', () => {
    const oldPattern = /^(\w+(?:_\w+)*):[^\S\n]*(.*)$/gm;
    const newPattern = /^(\w+):[^\S\n]*(.*)$/gm;
    const groups = (pattern: RegExp, s: string) =>
      JSON.stringify([...s.matchAll(pattern)].map((m) => [m.index, ...m]));
    const mismatches: string[] = [];
    let checked = 0;
    for (const s of allStrings(['a', '_', '1', ':', ' ', '\n', '-'], 7)) {
      if (groups(newPattern, s) !== groups(oldPattern, s)) mismatches.push(s);
      checked++;
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBeGreaterThan(900_000);
  });

  it('does not let section keys overwrite the template prototype', () => {
    const result = parseExperimentMarkdown('## Basic Info\n\n__proto__: polluted\n');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  describe('stays linear on pathological input', () => {
    // Each case times n and 4n (4n is the size these inputs had when they
    // were found), so a return to the old super-linear scans fails on the
    // ratio however fast the runner is.
    const parse = (md: (n: number) => string) => (n: number) => parseExperimentMarkdown(md(n));

    it('key/value line with many underscores and no colon', () => {
      // The old key regex backtracked exponentially: 40 pairs already took
      // hours, so a generous absolute bound still proves the fix.
      const start = performance.now();
      parseExperimentMarkdown('## Foo\n' + 'a_'.repeat(40) + '!');
      expect(performance.now() - start).toBeLessThan(1_000);
      expectLinear(
        parse((n) => '## Foo\n' + 'a_'.repeat(n) + '!'),
        12_500
      );
    });

    it('audience section with many invalid json fence openings', () => {
      expectLinear(
        parse((n) => '## Audience\n' + '```jsonx'.repeat(n)),
        10_000
      );
      expectLinear(
        parse((n) => '## Audience\n' + '```json \t'.repeat(n)),
        10_000
      );
    });

    it('audience json fence with no closing fence', () => {
      expectLinear(
        parse((n) => '## Audience\n```json' + '\n'.repeat(n) + 'x'),
        25_000
      );
    });

    it('custom field headings with no newline', () => {
      expectLinear(
        parse((n) => '## Foo\n### \t' + ' \t'.repeat(n)),
        25_000
      );
      expectLinear(
        parse((n) => '## Foo\n' + '### x'.repeat(n)),
        5_000
      );
    });

    it('variant and list lines with a long run of whitespace before a line terminator', () => {
      expectLinear(
        parse((n) => `## Variants\n### variant_0\na:${' '.repeat(n)}x\ry\n`),
        25_000
      );
      expectLinear(
        parse((n) => `## Foo\nk:\n-${' '.repeat(n)}x\ry\n`),
        25_000
      );
    });

    it('many sections that each hold custom fields', () => {
      const md = bySize((n) =>
        Array.from({ length: n }, (_, i) => `## S${i}\n### F${i}\nv${i}\n`).join('')
      );
      expectLinear(parse(md), 2_000);
      const result = parseExperimentMarkdown(md(8_000));
      expect(Object.keys(result.custom_fields!)).toHaveLength(8_000);
      expect(result.custom_fields!.F7999).toBe('v7999');
    });

    it('rejects content over the size limit before parsing', () => {
      // The length check runs first, so this is about the error, not timing.
      expect(() => parseExperimentMarkdown('x'.repeat(MAX_TEMPLATE_LENGTH + 1))).toThrow(
        /the limit is/
      );
      expect(() => parseExperimentMarkdown('## A\n' + 'x'.repeat(5_000_000))).not.toThrow();
    });

    it('many empty keys each followed by a list scan', () => {
      expectLinear(
        parse((n) => '## Foo\n' + 'k:\n'.repeat(n)),
        7_500
      );
    });
  });
});
