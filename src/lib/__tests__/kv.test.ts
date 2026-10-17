import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Address, Hex } from 'viem';

/**
 * Acceptance tests for src/lib/kv.ts (spec section 11).
 *
 * `@vercel/kv` is mocked at the package boundary: both the `kv` singleton and
 * `createClient` resolve to the same spy-backed client, backed by an in-memory
 * Map so set/get round-trips behave like the real store. The KV_REST_API_* env
 * vars gate every operation; without them the cache no-ops gracefully.
 */

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@vercel/kv', () => {
  const client = {
    get: (...args: unknown[]) => h.get(...args),
    set: (...args: unknown[]) => h.set(...args),
    del: (...args: unknown[]) => h.del(...args),
  };
  return {
    kv: client,
    default: client,
    createClient: (...args: unknown[]) => {
      h.createClient(...args);
      return client;
    },
    VercelKV: class VercelKV {},
  };
});

const KV_URL_ENV = 'KV_REST_API_URL';
const KV_TOKEN_ENV = 'KV_REST_API_TOKEN';
const KV_URL = 'https://kv.example.test';
const KV_TOKEN = 'kv-token-for-tests';
const DAY_SECONDS = 86_400;

const DOC_HASH = ('0x' + 'ab'.repeat(32)) as Hex;
const NOTARY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

const ACT = {
  docHash: DOC_HASH,
  notary: NOTARY,
  signer: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
  ipfsCid: ('0x' + '22'.repeat(32)) as Hex,
  docType: ('0x' + '33'.repeat(32)) as Hex,
  stateCode: ('0x' + '44'.repeat(32)) as Hex,
  timestamp: 1_700_000_000n,
  revoked: false,
};

const STATS = { totalActs: 42, earnings: 123_456n };

function setKvEnv(present: boolean): void {
  for (const [name, value] of [
    [KV_URL_ENV, KV_URL],
    [KV_TOKEN_ENV, KV_TOKEN],
  ] as const) {
    if (present) {
      vi.stubEnv(name, value);
    } else {
      vi.stubEnv(name, '');
      delete process.env[name];
    }
  }
}

function ttlSeconds(options: unknown): number | undefined {
  const opts = options as { ex?: number; px?: number } | undefined;
  if (!opts) return undefined;
  if (typeof opts.ex === 'number') return opts.ex;
  if (typeof opts.px === 'number') return opts.px / 1_000;
  return undefined;
}

function wireInMemoryStore(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  h.set.mockImplementation(async (key: string, value: unknown) => {
    store.set(key, value);
    return 'OK';
  });
  h.get.mockImplementation(async (key: string) => store.get(key));
  return store;
}

async function importKv(): Promise<typeof import('@/lib/kv')> {
  vi.resetModules();
  return await import('@/lib/kv');
}

beforeEach(() => {
  h.createClient.mockReset();
  h.get.mockReset();
  h.set.mockReset();
  h.del.mockReset();
  wireInMemoryStore();
  setKvEnv(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/kv', () => {
  describe('act cache', () => {
    test('test_cacheAct_storesActUnderActKeyWithTwentyFourHourTtl', async () => {
      const { cacheAct } = await importKv();

      await cacheAct(DOC_HASH, ACT);

      expect(h.set).toHaveBeenCalledTimes(1);
      const call = h.set.mock.calls[0] as [string, unknown, unknown];
      expect(call[0]).toBe(`act:${DOC_HASH}`);
      expect(ttlSeconds(call[2])).toBe(DAY_SECONDS);
    });

    test('test_getCachedAct_returnsCachedActAfterCacheAct', async () => {
      const { cacheAct, getCachedAct } = await importKv();

      await cacheAct(DOC_HASH, ACT);
      const cached = await getCachedAct(DOC_HASH);

      expect(cached).toEqual(ACT);
      expect((cached as typeof ACT).timestamp).toBe(1_700_000_000n);
    });

    test('test_getCachedAct_returnsNullOnCacheMiss', async () => {
      const { getCachedAct } = await importKv();

      await expect(getCachedAct(DOC_HASH)).resolves.toBeNull();
    });
  });

  describe('notary stats cache', () => {
    test('test_cacheNotaryStats_andGetCachedNotaryStats_roundTripBigintEarnings', async () => {
      const { cacheNotaryStats, getCachedNotaryStats } = await importKv();

      await cacheNotaryStats(NOTARY, STATS);
      const cached = await getCachedNotaryStats(NOTARY);

      expect(cached).toEqual(STATS);
      expect((cached as typeof STATS).earnings).toBe(123_456n);
    });

    test('test_getCachedNotaryStats_returnsNullOnCacheMiss', async () => {
      const { getCachedNotaryStats } = await importKv();

      await expect(getCachedNotaryStats(NOTARY)).resolves.toBeNull();
    });
  });

  describe('graceful degradation without KV env', () => {
    test('test_cacheAct_isNoOpWithoutKvEnv', async () => {
      setKvEnv(false);
      const { cacheAct } = await importKv();

      await expect(cacheAct(DOC_HASH, ACT)).resolves.toBeUndefined();
      expect(h.set).not.toHaveBeenCalled();
    });

    test('test_getCachedAct_returnsNullWithoutKvEnv', async () => {
      setKvEnv(false);
      const { getCachedAct } = await importKv();

      await expect(getCachedAct(DOC_HASH)).resolves.toBeNull();
      expect(h.get).not.toHaveBeenCalled();
    });

    test('test_cacheNotaryStats_isNoOpWithoutKvEnv', async () => {
      setKvEnv(false);
      const { cacheNotaryStats } = await importKv();

      await expect(cacheNotaryStats(NOTARY, STATS)).resolves.toBeUndefined();
      expect(h.set).not.toHaveBeenCalled();
    });

    test('test_getCachedNotaryStats_returnsNullWithoutKvEnv', async () => {
      setKvEnv(false);
      const { getCachedNotaryStats } = await importKv();

      await expect(getCachedNotaryStats(NOTARY)).resolves.toBeNull();
      expect(h.get).not.toHaveBeenCalled();
    });
  });
});
