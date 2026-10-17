import { describe, it, expect } from 'vitest';
import { extractAngleBracketed, replaceMarkdownImages } from './linear-match.js';
import { allStrings, expectSameAsLegacy, randomStrings } from '../../test/helpers/differential.js';
import { expectLinear } from '../../test/helpers/timing.js';

const legacy = {
  angleBracketed: (s: string) => /<(.+?)>/.exec(s)?.[1],
  markdownImages: (s: string) =>
    s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `{${alt}|${url}}`),
};
const replaceImages = (s: string) => replaceMarkdownImages(s, (alt, url) => `{${alt}|${url}}`);

describe('extractAngleBracketed', () => {
  it('extracts the email from a "Name <email>" reference', () => {
    expect(extractAngleBracketed('Jane Doe <jane@example.com>')).toBe('jane@example.com');
    expect(extractAngleBracketed('jane@example.com')).toBeUndefined();
  });

  it('matches /<(.+?)>/ exactly', () => {
    const chars = ['<', '>', 'a', '\n', '\r'];
    expectSameAsLegacy(allStrings(chars, 8), extractAngleBracketed, legacy.angleBracketed);
  });

  it('stays linear on a long run of unclosed brackets', () => {
    const input = (n: number) => '<'.repeat(n) + '\n<>';
    expect(extractAngleBracketed(input(200_000))).toBeUndefined();
    expectLinear((n) => extractAngleBracketed(input(n)), 50_000);
  });
});

describe('replaceMarkdownImages', () => {
  it('replaces each image with the replacer result', () => {
    expect(replaceImages('see ![shot](a.png) and ![](b.png)')).toBe(
      'see {shot|a.png} and {|b.png}'
    );
  });

  it('matches the old image regex exactly', () => {
    const tokens = ['![', '!', '[', ']', '(', ')', 'a'];
    expectSameAsLegacy(allStrings(tokens, 7), replaceImages, legacy.markdownImages);
    expectSameAsLegacy(randomStrings(tokens, 20_000, 30), replaceImages, legacy.markdownImages);
  });

  it('stays linear on a long run of unclosed images', () => {
    const input = (n: number) => '!['.repeat(n) + ']![]([)';
    expect(replaceImages(input(100_000))).toBe('!['.repeat(100_000) + ']{|[}');
    expectLinear((n) => replaceImages(input(n)), 25_000);
  });
});
