import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Address, Hex } from 'viem';

/**
 * API integrity tests for GET /api/notary/[address] (notary dashboard data).
 *
 * Shape: `{ notary, acts, stats }` with JSON-safe strings; the stats
 * read-through cache (`@/lib/kv`) is preferred and computed from chain state
 * on a miss. Malformed addresses → 400, unconfigured registry → 503.
 */

const h = vi.hoisted(() => ({
  getNotary: vi.fn(),
  getActsByNotary: vi.fn(),
  getAct: vi.fn(),
  getNotaryRegistryAddress: vi.fn(),
  getCachedNotaryStats: vi.fn(),
  cacheNotaryStats: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/contract', () => ({
  getNotary: (...args: unknown[]) => h.getNotary(...args),
  getActsByNotary: (...args: unknown[]) => h.getActsByNotary(...args),
  getAct: (...args: unknown[]) => h.getAct(...args),
  getNotaryRegistryAddress: () => h.getNotaryRegistryAddress(),
  isNotaryActive: vi.fn(),
  notaryRegistryAbi: [],
}));

vi.mock('@/lib/kv', () => ({
  getCachedNotaryStats: (...args: unknown[]) => h.getCachedNotaryStats(...args),
  cacheNotaryStats: (...args: unknown[]) => h.cacheNotaryStats(...args),
  cacheAct: vi.fn(),
  getCachedAct: vi.fn(),
}));

vi.mock('@/app/api/_lib/web3-provider', () => ({
  getServerPublicClient: () => ({}),
  createRelayerProvider: () => ({}),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { GET } from '@/app/api/notary/[address]/route';

const NOTARY = `0x${'aa'.repeat(20)}` as Address;
const ACT_HASHES = [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`, `0x${'33'.repeat(32)}`] as Hex[];

const ACTIVE_RECORD = {
  commissionHash: `0x${'44'.repeat(32)}`,
  stateCode: `0x${'ee'.repeat(32)}`,
  commissionExpiry: 2_000_000_000n,
  active: true,
};

const EMPTY_RECORD = {
  commissionHash: `0x${'00'.repeat(32)}`,
  stateCode: `0x${'00'.repeat(32)}`,
  commissionExpiry: 0n,
  active: false,
};

function request(address: string): Request {
  return new Request(`http://localhost/api/notary/${address}`);
}

function params(address: string): { params: Promise<{ address: string }> } {
  return { params: Promise.resolve({ address }) };
}

beforeEach(() => {
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.getNotaryRegistryAddress.mockReturnValue('0x5FbDB2315678afecb367f032d93F642f64180aa3');
  h.getNotary.mockResolvedValue(ACTIVE_RECORD);
  h.getActsByNotary.mockResolvedValue(ACT_HASHES);
  // Per-act standing: default every act is non-revoked (earns the fee).
  h.getAct.mockImplementation(async (_client: unknown, docHash: string) => ({
    docHash,
    notary: NOTARY,
    signer: `0x${'bb'.repeat(20)}`,
    ipfsCid: `0x${'cc'.repeat(32)}`,
    docType: `0x${'dd'.repeat(32)}`,
    stateCode: `0x${'ee'.repeat(32)}`,
    timestamp: 1_800_000_000n,
    revoked: false,
  }));
  h.getCachedNotaryStats.mockResolvedValue(null);
  h.cacheNotaryStats.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/notary/[address] — validation and configuration', () => {
  test('test_api_notaryAddress_rejectsMalformedAddressWith400', async () => {
    const res = await GET(request('0x123'), params('0x123'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid address');
    expect(h.getNotary).not.toHaveBeenCalled();
  });

  test('test_api_notaryAddress_rejectsNonHexAddressWith400', async () => {
    const res = await GET(request('not-an-address'), params('not-an-address'));
    expect(res.status).toBe(400);
  });

  test('test_api_notaryAddress_returns503WhenRegistryUnconfigured', async () => {
    h.getNotaryRegistryAddress.mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set');
    });
    const res = await GET(request(NOTARY), params(NOTARY));
    expect(res.status).toBe(503);
  });

  test('test_api_notaryAddress_returns500OnUnexpectedFailure', async () => {
    h.getNotary.mockRejectedValue(new Error('rpc unavailable'));
    const res = await GET(request(NOTARY), params(NOTARY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('internal');
  });
});

describe('GET /api/notary/[address] — happy path', () => {
  test('test_api_notaryAddress_returnsDashboardShape', async () => {
    const res = await GET(request(NOTARY), params(NOTARY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notary.commissionExpiry).toBe('2000000000');
    expect(body.notary.active).toBe(true);
    expect(body.acts).toEqual(ACT_HASHES);
    expect(body.stats.totalActs).toBe(3);
    expect(body.stats.earnings).toBe('2970000'); // 3 × 990000n, decimal string
  });

  test('test_api_notaryAddress_normalizesAddressCase', async () => {
    const res = await GET(request(NOTARY.toUpperCase().replace('0X', '0x')), params(NOTARY));
    expect(res.status).toBe(200);
    expect(h.getNotary).toHaveBeenCalledTimes(1);
  });

  test('test_api_notaryAddress_returnsNullNotaryForEmptyRecord', async () => {
    h.getNotary.mockResolvedValue(EMPTY_RECORD);
    h.getActsByNotary.mockResolvedValue([]);
    const res = await GET(request(NOTARY), params(NOTARY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notary).toBeNull();
    expect(body.acts).toEqual([]);
    expect(body.stats).toEqual({ totalActs: 0, earnings: '0' });
  });

  test('test_api_notaryAddress_derivesStatsFromChainNotCache', async () => {
    // A stale cache entry must never be served: stats come from chain state.
    h.getCachedNotaryStats.mockResolvedValue({ totalActs: 99, earnings: 99_999_999n });
    const res = await GET(request(NOTARY), params(NOTARY));
    const body = await res.json();
    expect(body.stats.totalActs).toBe(3);
    expect(body.stats.earnings).toBe('2970000');
  });

  test('test_api_notaryAddress_writesDerivedStatsToCacheBestEffort', async () => {
    const res = await GET(request(NOTARY), params(NOTARY));
    expect(res.status).toBe(200);
    expect(h.cacheNotaryStats).toHaveBeenCalledTimes(1);
    const [addressArg, statsArg] = h.cacheNotaryStats.mock.calls[0] as [
      unknown,
      { totalActs: number; earnings: bigint },
    ];
    expect(String(addressArg).toLowerCase()).toBe(NOTARY.toLowerCase());
    expect(statsArg.totalActs).toBe(3);
    expect(statsArg.earnings).toBe(2_970_000n);
  });

  test('test_api_notaryAddress_excludesRevokedActsFromEarnings', async () => {
    h.getAct.mockImplementation(async (_client: unknown, docHash: string) => ({
      docHash,
      notary: NOTARY,
      signer: `0x${'bb'.repeat(20)}`,
      ipfsCid: `0x${'cc'.repeat(32)}`,
      docType: `0x${'dd'.repeat(32)}`,
      stateCode: `0x${'ee'.repeat(32)}`,
      timestamp: 1_800_000_000n,
      revoked: docHash === ACT_HASHES[0],
    }));

    const res = await GET(request(NOTARY), params(NOTARY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats.totalActs).toBe(3); // every recorded act still counts
    expect(body.stats.earnings).toBe('1980000'); // 2 non-revoked × 990000
  });

  test('test_api_notaryAddress_excludesUnreadableActsFromEarningsFailSafe', async () => {
    h.getAct.mockImplementation(async (_client: unknown, docHash: string) => {
      if (docHash === ACT_HASHES[2]) {
        throw new Error('rpc flake');
      }
      return {
        docHash,
        notary: NOTARY,
        signer: `0x${'bb'.repeat(20)}`,
        ipfsCid: `0x${'cc'.repeat(32)}`,
        docType: `0x${'dd'.repeat(32)}`,
        stateCode: `0x${'ee'.repeat(32)}`,
        timestamp: 1_800_000_000n,
        revoked: false,
      };
    });

    const res = await GET(request(NOTARY), params(NOTARY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stats.totalActs).toBe(3);
    expect(body.stats.earnings).toBe('1980000'); // never over-count on RPC failure
  });
});
