import { expect } from 'vitest';

// Generators and an assertion for checking that a hand-written matcher returns
// exactly what the regex it replaced returned.

export function* allStrings(alphabet: string[], maxLength: number): Generator<string> {
  let current = [''];
  yield '';
  for (let length = 1; length <= maxLength; length++) {
    const next: string[] = [];
    for (const prefix of current) {
      for (const ch of alphabet) {
        next.push(prefix + ch);
        yield prefix + ch;
      }
    }
    current = next;
  }
}

export function* randomStrings(
  alphabet: string[],
  count: number,
  maxLength: number
): Generator<string> {
  let seed = 0x2f6b1d3;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  for (let n = 0; n < count; n++) {
    let s = '';
    const length = Math.floor(next() * maxLength);
    for (let i = 0; i < length; i++) s += alphabet[Math.floor(next() * alphabet.length)];
    yield s;
  }
}

export function expectSameAsLegacy<T>(
  inputs: Iterable<string>,
  actual: (s: string) => T,
  expected: (s: string) => T
): void {
  let checked = 0;
  for (const input of inputs) {
    const got = actual(input);
    const want = expected(input);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      expect({ input, got }).toEqual({ input, got: want });
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}
