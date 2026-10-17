import { expect } from 'vitest';

interface LinearOptions {
  maxMs?: number;
  maxRatio?: number;
  floorMs?: number;
  repeats?: number;
}

async function bestOf(run: () => unknown, repeats: number): Promise<number> {
  let best = Infinity;
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    await run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function bestOfSync(run: () => void, repeats: number): number {
  let best = Infinity;
  for (let i = 0; i < repeats; i++) {
    const start = performance.now();
    run();
    best = Math.min(best, performance.now() - start);
  }
  return best;
}

function assertScaling(
  smallMs: number,
  largeMs: number,
  { maxMs = 1_000, maxRatio = 8, floorMs = 2 }: LinearOptions
): void {
  const small = Math.max(smallMs, floorMs);
  expect(largeMs, `4n took ${largeMs.toFixed(1)}ms vs ${small.toFixed(1)}ms for n`).toBeLessThan(
    maxRatio * small
  );
  expect(largeMs).toBeLessThan(maxMs);
}

/**
 * Asserts `run(n)` scales close to linearly between `n` and `4n`, so a
 * regression to quadratic work fails without depending on how fast the CI
 * runner is. Linear work grows ~4x over that range and quadratic ~16x; the
 * bound of 8x sits between them. Timings are the best of a few runs to shed
 * GC and JIT noise, and `floorMs` keeps sub-millisecond noise from dominating.
 *
 * `maxMs` is a generous absolute ceiling for the large input as well, so a
 * path that is linear but pathologically slow still fails. Lower `maxRatio`
 * to assert work is capped (a budget that stops early grows well under 4x).
 */
export function expectLinear(
  run: (n: number) => void,
  n: number,
  options: LinearOptions = {}
): void {
  const repeats = options.repeats ?? 3;
  run(n); // warm up the JIT
  const small = bestOfSync(() => run(n), repeats);
  const large = bestOfSync(() => run(4 * n), repeats);
  assertScaling(small, large, options);
}

/** {@link expectLinear} for code under test that returns a promise. */
export async function expectLinearAsync(
  run: (n: number) => Promise<unknown>,
  n: number,
  options: LinearOptions = {}
): Promise<void> {
  const repeats = options.repeats ?? 3;
  await run(n); // warm up the JIT
  const small = await bestOf(() => run(n), repeats);
  const large = await bestOf(() => run(4 * n), repeats);
  assertScaling(small, large, options);
}

/**
 * Asserts `run` costs at most `maxRatio` times `baseline`, a run over the
 * same input minus the pathological part, for cases where the extra work is
 * capped in size and so cannot be told apart by scaling alone. Both are timed
 * on the same runner, so the bound does not depend on its speed.
 */
export function expectCostWithin(
  run: () => void,
  baseline: () => void,
  { maxRatio = 3, floorMs = 2, repeats = 3 }: Omit<LinearOptions, 'maxMs'> = {}
): void {
  run(); // warm up the JIT
  baseline();
  const cost = bestOfSync(run, repeats);
  const base = Math.max(bestOfSync(baseline, repeats), floorMs);
  expect(cost, `took ${cost.toFixed(1)}ms vs ${base.toFixed(1)}ms baseline`).toBeLessThan(
    maxRatio * base
  );
}

/**
 * Caches `make(n)` per size so a scaling check times the code under test
 * rather than building its input: only the first run at each size pays for
 * `make`, and best-of timing drops that run.
 */
export function bySize<T>(make: (n: number) => T): (n: number) => T {
  const cache = new Map<number, T>();
  return (n) => {
    let value = cache.get(n);
    if (value === undefined) {
      value = make(n);
      cache.set(n, value);
    }
    return value;
  };
}
