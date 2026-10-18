import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Hex } from 'viem';

/**
 * API integrity tests for POST /api/anchor/btc (Bitcoin anchoring).
 *
 * Pinned contract: `Authorization: Bearer <ANCHOR_API_TOKEN>` required,
 * digest validation → 400, calendar/OTS failures → 503, happy path returns
 * `{ ok: true, otsProof }` with the proof as base64.
 */

const h = vi.hoisted(() => ({
  stampHash: vi.fn(),
  cacheOtsProof: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/anchor', () => ({
  stampHash: (...args: unknown[]) => h.stampHash(...args),
  verifyAnchor: vi.fn(),
}));

vi.mock('@/app/api/_lib/kv-extras', () => ({
  cacheOtsProof: (...args: unknown[]) => h.cacheOtsProof(...args),
  getCachedOtsProof: vi.fn(),
  cacheActExtras: vi.fn(),
  getCachedActExtras: vi.fn(),
  cachePendingCommission: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { POST } from '@/app/api/anchor/btc/route';

const TOKEN_ENV = 'ANCHOR_API_TOKEN';
const TOKEN = 'test-anchor-token';
const DIGEST = `0x${'55'.repeat(32)}` as Hex;

function request(body: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/api/anchor/btc', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv(TOKEN_ENV, TOKEN);
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.stampHash.mockResolvedValue({ otsProof: new Uint8Array([1, 2, 3]) });
  h.cacheOtsProof.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/anchor/btc — authentication', () => {
  test('test_api_anchor_rejectsMissingBearerWith401', async () => {
    const res = await POST(request({ digest: DIGEST }, null));
    expect(res.status).toBe(401);
    expect(h.stampHash).not.toHaveBeenCalled();
  });

  test('test_api_anchor_rejectsWrongBearerWith401', async () => {
    const res = await POST(request({ digest: DIGEST }, 'wrong-token'));
    expect(res.status).toBe(401);
    expect(h.stampHash).not.toHaveBeenCalled();
  });

  test('test_api_anchor_returns503WhenApiTokenUnsetFailClosed', async () => {
    delete process.env[TOKEN_ENV];
    const res = await POST(request({ digest: DIGEST }));
    expect(res.status).toBe(503);
    expect(h.stampHash).not.toHaveBeenCalled();
  });
});

describe('POST /api/anchor/btc — validation', () => {
  test('test_api_anchor_rejectsMalformedDigestWith400', async () => {
    const res = await POST(request({ digest: '0xnothex' }));
    expect(res.status).toBe(400);
  });

  test('test_api_anchor_rejectsMissingDigestWith400', async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
  });

  test('test_api_anchor_rejectsMalformedJsonWith400', async () => {
    const res = await POST(
      new Request('http://localhost/api/anchor/btc', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/anchor/btc — happy path', () => {
  test('test_api_anchor_stampsDigestAndReturnsBase64Proof', async () => {
    const res = await POST(request({ digest: DIGEST }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.otsProof).toBe(Buffer.from([1, 2, 3]).toString('base64'));
    expect(h.stampHash).toHaveBeenCalledTimes(1);
  });

  test('test_api_anchor_cachesProofUnderDigest', async () => {
    const res = await POST(request({ digest: DIGEST }));
    expect(res.status).toBe(200);
    expect(h.cacheOtsProof).toHaveBeenCalledWith(DIGEST, Buffer.from([1, 2, 3]).toString('base64'));
  });
});

describe('POST /api/anchor/btc — calendar failures', () => {
  test('test_api_anchor_returns503WhenCalendarUnavailable', async () => {
    h.stampHash.mockRejectedValue(new Error('calendar timeout'));
    const res = await POST(request({ digest: DIGEST }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('calendar unavailable');
  });
});
