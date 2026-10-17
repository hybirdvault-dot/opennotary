import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Acceptance tests for src/lib/ratelimit.ts (spec section 8).
 *
 * The limiter is pure and synchronous over an in-module Map. Windows are driven
 * deterministically with fake timers and a fixed system time.
 */

const START_MS = 1_700_000_000_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

async function importRateLimit(): Promise<typeof import('@/lib/ratelimit')> {
  vi.resetModules();
  return await import('@/lib/ratelimit');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('src/lib/ratelimit', () => {
  test('test_rateLimit_allowsRequestUpToDefaultLimitAndReportsRemaining', async () => {
    const { rateLimit } = await importRateLimit();

    const first = rateLimit('key-a');
    expect(first).toEqual({
      success: true,
      remaining: DEFAULT_LIMIT - 1,
      reset: START_MS + DEFAULT_WINDOW_MS,
    });

    for (let hit = 2; hit <= DEFAULT_LIMIT; hit += 1) {
      const result = rateLimit('key-a');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(DEFAULT_LIMIT - hit);
    }
  });

  test('test_rateLimit_rejectsRequestOnceDefaultLimitIsExactlyReached', async () => {
    const { rateLimit } = await importRateLimit();

    for (let hit = 1; hit <= DEFAULT_LIMIT; hit += 1) {
      expect(rateLimit('key-b').success).toBe(true);
    }

    const overflow = rateLimit('key-b');
    expect(overflow.success).toBe(false);
    expect(overflow.remaining).toBe(0);
    expect(overflow.reset).toBe(START_MS + DEFAULT_WINDOW_MS);
  });

  test('test_rateLimit_freesWindowAfterDefaultWindowMsElapses', async () => {
    const { rateLimit } = await importRateLimit();

    for (let hit = 1; hit <= DEFAULT_LIMIT; hit += 1) {
      rateLimit('key-c');
    }
    expect(rateLimit('key-c').success).toBe(false);

    vi.advanceTimersByTime(DEFAULT_WINDOW_MS);

    const afterReset = rateLimit('key-c');
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(DEFAULT_LIMIT - 1);
    expect(afterReset.reset).toBe(START_MS + DEFAULT_WINDOW_MS + DEFAULT_WINDOW_MS);
  });

  test('test_rateLimit_usesCustomLimitOption', async () => {
    const { rateLimit } = await importRateLimit();

    expect(rateLimit('key-d', { limit: 2 })).toEqual({
      success: true,
      remaining: 1,
      reset: START_MS + DEFAULT_WINDOW_MS,
    });
    expect(rateLimit('key-d', { limit: 2 }).success).toBe(true);
    const overflow = rateLimit('key-d', { limit: 2 });
    expect(overflow.success).toBe(false);
    expect(overflow.remaining).toBe(0);
  });

  test('test_rateLimit_usesCustomWindowOption', async () => {
    const { rateLimit } = await importRateLimit();
    const opts = { limit: 1, windowMs: 1_000 };

    expect(rateLimit('key-e', opts)).toEqual({
      success: true,
      remaining: 0,
      reset: START_MS + 1_000,
    });
    expect(rateLimit('key-e', opts).success).toBe(false);

    vi.advanceTimersByTime(1_000);

    expect(rateLimit('key-e', opts).success).toBe(true);
  });

  test('test_rateLimit_keepsKeysIndependentOfEachOther', async () => {
    const { rateLimit } = await importRateLimit();

    for (let hit = 1; hit <= DEFAULT_LIMIT; hit += 1) {
      rateLimit('exhausted-key');
    }
    expect(rateLimit('exhausted-key').success).toBe(false);

    const other = rateLimit('fresh-key');
    expect(other.success).toBe(true);
    expect(other.remaining).toBe(DEFAULT_LIMIT - 1);
  });

  test('test_rateLimit_treatsEmptyStringAsValidDistinctKey', async () => {
    const { rateLimit } = await importRateLimit();

    expect(rateLimit('').success).toBe(true);
    expect(rateLimit('').remaining).toBe(DEFAULT_LIMIT - 2);
    expect(rateLimit('other').remaining).toBe(DEFAULT_LIMIT - 1);
  });
});
