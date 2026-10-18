import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * API integrity tests for POST /api/notary/register.
 *
 * Validates `notaryRegisterSchema` input (400 + issues shape on failure) and
 * records the pending commission through `@/app/api/_lib/kv-extras`, returning
 * the pinned `{ ok, notary, commissionExpiry, txHash, note }` shape.
 */

const h = vi.hoisted(() => ({
  cachePendingCommission: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/app/api/_lib/kv-extras', () => ({
  cachePendingCommission: (...args: unknown[]) => h.cachePendingCommission(...args),
  cacheActExtras: vi.fn(),
  getCachedActExtras: vi.fn(),
  cacheOtsProof: vi.fn(),
  getCachedOtsProof: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { POST } from '@/app/api/notary/register/route';

const NOTARY = `0x${'aa'.repeat(20)}`;
const COMMISSION_HASH = `0x${'11'.repeat(32)}`;

const VALID_BODY = {
  notary: NOTARY,
  commissionHash: COMMISSION_HASH,
  stateCode: 'CA',
  commissionExpiry: 2_000_000_000,
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/notary/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.cachePendingCommission.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/notary/register — validation', () => {
  test('test_api_notaryRegister_rejectsMalformedAddressWith400Shape', async () => {
    const res = await POST(request({ ...VALID_BODY, notary: '0x123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(h.cachePendingCommission).not.toHaveBeenCalled();
  });

  test('test_api_notaryRegister_rejectsMalformedCommissionHashWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, commissionHash: 'not-hex' }));
    expect(res.status).toBe(400);
  });

  test('test_api_notaryRegister_rejectsShortStateCodeWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, stateCode: 'C' }));
    expect(res.status).toBe(400);
  });

  test('test_api_notaryRegister_rejectsMissingFieldsWith400', async () => {
    const res = await POST(request({ notary: NOTARY }));
    expect(res.status).toBe(400);
  });

  test('test_api_notaryRegister_rejectsMalformedJsonWith400', async () => {
    const res = await POST(
      new Request('http://localhost/api/notary/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/notary/register — happy path', () => {
  test('test_api_notaryRegister_recordsPendingCommissionAndReturnsOkShape', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.notary).toBe(NOTARY);
    expect(body.commissionExpiry).toBe(2_000_000_000);
    expect(body.txHash).toBeNull();
    expect(typeof body.note).toBe('string');
  });

  test('test_api_notaryRegister_cachesPendingCommissionRecord', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    expect(h.cachePendingCommission).toHaveBeenCalledTimes(1);
    const record = h.cachePendingCommission.mock.calls[0][0] as Record<string, unknown>;
    expect(record.notary).toBe(NOTARY);
    expect(record.commissionHash).toBe(COMMISSION_HASH);
    expect(record.stateCode).toBe('CA');
    expect(record.commissionExpiry).toBe(2_000_000_000);
    expect(typeof record.createdAt).toBe('number');
  });

  test('test_api_notaryRegister_acceptsIsoDateCommissionExpiry', async () => {
    const res = await POST(request({ ...VALID_BODY, commissionExpiry: '2033-05-18T03:33:20.000Z' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.commissionExpiry).toBe('number');
    expect(body.commissionExpiry).toBeGreaterThan(Date.now() / 1000);
  });
});
