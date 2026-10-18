import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Hex } from 'viem';

import { bytes32ToCid } from '@/lib/cid';

/**
 * API integrity tests for GET /api/verify/[docHash].
 *
 * Pinned contract:
 * - `ActNotFound` → 404 ALWAYS — there is NO KV fallback, even when the
 *   read-through cache holds data for the hash (KV is never truth).
 * - Registry unconfigured → 503.
 * - Happy path shape: {docHash, act, attestation, ots, ipfsUri, txHash} with
 *   JSON-safe string timestamps, sourced from `getAct` + cached extras.
 */

const h = vi.hoisted(() => ({
  getAct: vi.fn(),
  getNotaryRegistryAddress: vi.fn(),
  getAttestation: vi.fn(),
  getCachedAct: vi.fn(),
  getCachedActExtras: vi.fn(),
  getCachedOtsProof: vi.fn(),
  verifyAnchor: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/contract', () => ({
  getAct: (...args: unknown[]) => h.getAct(...args),
  getNotaryRegistryAddress: () => h.getNotaryRegistryAddress(),
  getActsByNotary: vi.fn(),
  getNotary: vi.fn(),
  isNotaryActive: vi.fn(),
  notaryRegistryAbi: [],
}));

vi.mock('@/lib/attest', () => ({
  getAttestation: (...args: unknown[]) => h.getAttestation(...args),
  issueNotarialActAttestation: vi.fn(),
  revokeNotarialActAttestation: vi.fn(),
  getEasConfig: vi.fn(),
}));

vi.mock('@/lib/kv', () => ({
  getCachedAct: (...args: unknown[]) => h.getCachedAct(...args),
  cacheAct: vi.fn(),
  cacheNotaryStats: vi.fn(),
  getCachedNotaryStats: vi.fn(),
}));

vi.mock('@/app/api/_lib/kv-extras', () => ({
  getCachedActExtras: (...args: unknown[]) => h.getCachedActExtras(...args),
  getCachedOtsProof: (...args: unknown[]) => h.getCachedOtsProof(...args),
  cacheActExtras: vi.fn(),
  cacheOtsProof: vi.fn(),
  cachePendingCommission: vi.fn(),
}));

vi.mock('@/app/api/_lib/web3-provider', () => ({
  getServerPublicClient: () => ({}),
  createRelayerProvider: () => ({}),
}));

vi.mock('@/lib/anchor', () => ({
  verifyAnchor: (...args: unknown[]) => h.verifyAnchor(...args),
  stampHash: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { GET } from '@/app/api/verify/[docHash]/route';

const DOC_HASH = `0x${'11'.repeat(32)}` as Hex;
const UID = `0x${'77'.repeat(32)}` as Hex;

const ON_CHAIN_ACT = {
  docHash: DOC_HASH,
  notary: `0x${'aa'.repeat(20)}`,
  signer: `0x${'bb'.repeat(20)}`,
  ipfsCid: `0x${'cc'.repeat(32)}`,
  docType: `0x${'dd'.repeat(32)}`,
  stateCode: `0x${'ee'.repeat(32)}`,
  timestamp: 1_800_000_000n,
  revoked: false,
};

const ATTESTATION_RECORD = {
  uid: UID,
  schema: `0x${'01'.repeat(32)}`,
  attester: ON_CHAIN_ACT.notary,
  recipient: ON_CHAIN_ACT.notary,
  refUID: `0x${'00'.repeat(32)}`,
  revocable: false,
  revoked: false,
  time: 1_800_000_100n,
  data: '0x',
};

/** ActNotFound the way viem surfaces it: custom error name + revert message. */
function actNotFoundByMessage(): Error {
  return new Error('execution reverted: ActNotFound()');
}

/** ActNotFound via the errorName field alone (BaseError-style envelope). */
function actNotFoundByName(): Error {
  return Object.assign(new Error('The contract function "getAct" reverted.'), {
    errorName: 'ActNotFound',
  });
}

function request(docHash: string, search = ''): Request {
  return new Request(`http://localhost/api/verify/${docHash}${search}`);
}

function params(docHash: string): { params: Promise<{ docHash: string }> } {
  return { params: Promise.resolve({ docHash }) };
}

beforeEach(() => {
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.getNotaryRegistryAddress.mockReturnValue('0x5FbDB2315678afecb367f032d93F642f64180aa3');
  h.getAct.mockResolvedValue(ON_CHAIN_ACT);
  h.getCachedAct.mockResolvedValue(null);
  h.getCachedActExtras.mockResolvedValue(null);
  h.getCachedOtsProof.mockResolvedValue(null);
  h.getAttestation.mockResolvedValue(null);
  h.verifyAnchor.mockResolvedValue({ verified: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/verify/[docHash] — ActNotFound is always 404 (no KV fallback)', () => {
  test('test_api_verify_returns404ForActNotFoundEvenWhenCacheHasData', async () => {
    h.getAct.mockRejectedValue(actNotFoundByMessage());
    // KV cache deliberately holds a plausible act — it must NOT resurrect it.
    h.getCachedAct.mockResolvedValue(ON_CHAIN_ACT);

    const res = await GET(request(DOC_HASH), params(DOC_HASH));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(String(body.error)).toMatch(/not found/);
    // No KV fallback: the cache is never even consulted for a chain miss.
    expect(h.getCachedAct).not.toHaveBeenCalled();
  });

  test('test_api_verify_returns404ForActNotFoundViaErrorName', async () => {
    h.getAct.mockRejectedValue(actNotFoundByName());
    h.getCachedAct.mockResolvedValue(ON_CHAIN_ACT);

    const res = await GET(request(DOC_HASH), params(DOC_HASH));

    expect(res.status).toBe(404);
  });

  test('test_api_verify_returns404ForActNotFoundWithoutCacheEntry', async () => {
    h.getAct.mockRejectedValue(actNotFoundByMessage());
    h.getCachedAct.mockResolvedValue(null);

    const res = await GET(request(DOC_HASH), params(DOC_HASH));

    expect(res.status).toBe(404);
  });

  test('test_api_verify_cacheMissNeverSuppliesActForUnknownHash', async () => {
    h.getAct.mockRejectedValue(actNotFoundByMessage());
    h.getCachedAct.mockResolvedValue({
      ...ON_CHAIN_ACT,
      docHash: DOC_HASH,
      timestamp: 1_800_000_000n,
    });

    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.act == null).toBe(true);
  });
});

describe('GET /api/verify/[docHash] — validation and configuration', () => {
  test('test_api_verify_rejectsMalformedDocHashWith400', async () => {
    const res = await GET(request('not-a-hash'), params('not-a-hash'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid doc hash');
    expect(h.getAct).not.toHaveBeenCalled();
  });

  test('test_api_verify_rejectsShortDocHashWith400', async () => {
    const res = await GET(request(`0x${'11'.repeat(31)}`), params(`0x${'11'.repeat(31)}`));
    expect(res.status).toBe(400);
  });

  test('test_api_verify_returns503WhenRegistryUnconfigured', async () => {
    h.getNotaryRegistryAddress.mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set');
    });
    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    expect(res.status).toBe(503);
  });

  test('test_api_verify_returns500OnUnexpectedGetActFailure', async () => {
    h.getAct.mockRejectedValue(new Error('rpc unavailable'));
    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('internal');
  });
});

describe('GET /api/verify/[docHash] — happy path', () => {
  test('test_api_verify_returnsSerializableActShape', async () => {
    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docHash).toBe(DOC_HASH);
    expect(body.act).toBeTruthy();
    expect(body.act.timestamp).toBe('1800000000');
    expect(body.act.notary).toBe(ON_CHAIN_ACT.notary);
    expect(body.attestation).toBeNull();
    expect(body.ots).toEqual({ status: 'pending' });
    // ipfsUri is derived from the ON-CHAIN ipfsCid (lossless bytes32 -> CID), never null
    // when the act carries a CID digest.
    expect(body.ipfsUri).toBe(`https://${bytes32ToCid(ON_CHAIN_ACT.ipfsCid as Hex)}.ipfs.w3s.link`);
    expect(body.txHash).toBeNull();
  });

  test('test_api_verify_normalizesDocHashWithout0xPrefix', async () => {
    const bare = DOC_HASH.slice(2);
    const res = await GET(request(bare), params(bare));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docHash).toBe(DOC_HASH);
  });

  test('test_api_verify_surfacesCachedExtrasAndAttestation', async () => {
    h.getCachedActExtras.mockResolvedValue({
      attestationUid: UID,
      txHash: `0x${'44'.repeat(32)}`,
      ipfsUri: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
      otsDigest: `0x${'55'.repeat(32)}`,
    });
    h.getAttestation.mockResolvedValue(ATTESTATION_RECORD);

    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.attestation.uid).toBe(UID);
    expect(body.attestation.time).toBe('1800000100');
    expect(body.txHash).toBe(`0x${'44'.repeat(32)}`);
    // K1 binding: the client-asserted extras.ipfsUri ('ipfs://...') is deliberately
    // IGNORED — the link is derived from the on-chain ipfsCid digest instead.
    expect(body.ipfsUri).toBe(`https://${bytes32ToCid(ON_CHAIN_ACT.ipfsCid as Hex)}.ipfs.w3s.link`);
  });

  test('test_api_verify_uidQueryParamOverridesCachedUid', async () => {
    const explicit = `0x${'88'.repeat(32)}`;
    h.getCachedActExtras.mockResolvedValue({ attestationUid: UID });
    h.getAttestation.mockResolvedValue(ATTESTATION_RECORD);

    const res = await GET(request(DOC_HASH, `?uid=${explicit}`), params(DOC_HASH));

    expect(res.status).toBe(200);
    expect(h.getAttestation).toHaveBeenCalledTimes(1);
    const arg = h.getAttestation.mock.calls[0][0] as { uid: string };
    expect(arg.uid.toLowerCase()).toBe(explicit.toLowerCase());
  });

  test('test_api_verify_reportsOtsVerifiedWhenProofVerifies', async () => {
    h.getCachedActExtras.mockResolvedValue({ otsDigest: `0x${'55'.repeat(32)}` });
    h.getCachedOtsProof.mockResolvedValue(Buffer.from([1, 2, 3]).toString('base64'));
    h.verifyAnchor.mockResolvedValue({
      verified: true,
      bitcoinBlockHeight: 210,
      timestamp: 1_234_567_890n,
    });

    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ots.status).toBe('verified');
    expect(body.ots.bitcoinBlockHeight).toBe(210);
  });

  test('test_api_verify_keepsOtsPendingWhenProofVerificationThrows', async () => {
    h.getCachedActExtras.mockResolvedValue({ otsDigest: `0x${'55'.repeat(32)}` });
    h.getCachedOtsProof.mockResolvedValue(Buffer.from([1, 2, 3]).toString('base64'));
    h.verifyAnchor.mockRejectedValue(new Error('corrupt proof'));

    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ots).toEqual({ status: 'pending' });
  });

  test('test_api_verify_toleratesAttestationFetchFailure', async () => {
    h.getCachedActExtras.mockResolvedValue({ attestationUid: UID });
    h.getAttestation.mockRejectedValue(new Error('eas down'));

    const res = await GET(request(DOC_HASH), params(DOC_HASH));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.attestation).toBeNull();
  });
});
