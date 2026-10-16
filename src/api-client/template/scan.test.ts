import { describe, it } from 'vitest';
import {
  findJsonFenceBody,
  matchCustomFields,
  matchListItem,
  matchVariantKeyValue,
} from './scan.js';
import { allStrings, expectSameAsLegacy, randomStrings } from '../../test/helpers/differential.js';

// The regexes each scanner replaced. They are only safe to run on the short
// inputs generated here.
const legacy = {
  jsonFence: (s: string) => /```json\s*\n([\s\S]*?)\n\s*```/.exec(s)?.[1],
  listItem: (s: string) => /^[^\S\n]*-\s+(.+)$/.exec(s)?.[1],
  variantKeyValue: (s: string) => {
    const m = /^(\w+):\s*(.*)$/.exec(s);
    return m ? [m[1], m[2]] : undefined;
  },
  customFields: (s: string) =>
    [...s.matchAll(/### (.+?)\s*\n([\s\S]*?)(?=###|$)/g)].map((m) => [m[1], m[2]]),
};

const LINE_TERMINATORS = ['\r', '\u2028'];

describe('template scanners match the regexes they replaced', () => {
  it('findJsonFenceBody', () => {
    const tokens = ['```json', '```', '\n', ' ', 'x', '\r', '`'];
    expectSameAsLegacy(allStrings(tokens, 7), findJsonFenceBody, legacy.jsonFence);
    expectSameAsLegacy(randomStrings(tokens, 20_000, 30), findJsonFenceBody, legacy.jsonFence);
  });

  it('matchListItem', () => {
    const chars = ['-', ' ', '\t', 'a', ...LINE_TERMINATORS];
    expectSameAsLegacy(allStrings(chars, 7), matchListItem, legacy.listItem);
  });

  it('matchVariantKeyValue', () => {
    const chars = ['a', '_', ':', ' ', '\t', '-', ...LINE_TERMINATORS];
    expectSameAsLegacy(allStrings(chars, 6), matchVariantKeyValue, legacy.variantKeyValue);
  });

  it('matchCustomFields', () => {
    const tokens = ['### ', '###', '#', ' ', '\n', 'a', ...LINE_TERMINATORS];
    expectSameAsLegacy(allStrings(tokens, 6), matchCustomFields, legacy.customFields);
    expectSameAsLegacy(randomStrings(tokens, 20_000, 30), matchCustomFields, legacy.customFields);
  });
});
