import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Hex } from 'viem';

/**
 * API integrity tests for POST /api/notarize (pinned API body v2).
 *
 * Pinned contract:
 * - Body: {docHash, notary, signer, ipfsCid, docType, stateCode, fee(string),
 *   timestamp(string), deadline(string), notarySig, signerSig, txHash} with
 *   `Authorization: Bearer <NOTARIZE_API_TOKEN>`.
 * - unauthenticated → 401 · invalid sigs → 401 · validation/fee mismatch/
 *   receipt mismatch → 400 · config-missing → 503.
 *
 * External boundaries are mocked at the package/module boundary: `@/lib/eip712`
 * (signature verification), `@/lib/attest` (EAS issuance), viem clients via
 * `@/app/api/_lib/web3-provider` (tx receipt), `@/lib/contract`, `@/lib/kv` and
 * `@/app/api/_lib/kv-extras`. Route handlers are invoked as plain functions.
 */

const h = vi.hoisted(() => ({
  verifySignature: vi.fn(),
  buildEip712Domain: vi.fn(),
  buildNotaryAttestationMessage: vi.fn(),
  buildSignerAcknowledgmentMessage: vi.fn(),
  issueNotarialActAttestation: vi.fn(),
  getNotaryRegistryAddress: vi.fn(),
  isNotaryActive: vi.fn(),
  getTransactionReceipt: vi.fn(),
  rpcGetTransactionReceipt: vi.fn(),
  readContract: vi.fn(),
  cacheAct: vi.fn(),
  cacheActExtras: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/eip712', () => ({
  NOTARY_ATTESTATION_TYPES: {
    NotaryAttestation: [
      { name: 'docHash', type: 'bytes32' },
      { name: 'signer', type: 'address' },
      { name: 'ipfsCid', type: 'bytes32' },
      { name: 'docType', type: 'bytes32' },
      { name: 'stateCode', type: 'bytes32' },
      { name: 'fee', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
  },
  SIGNER_ACKNOWLEDGMENT_TYPES: {
    SignerAcknowledgment: [
      { name: 'docHash', type: 'bytes32' },
      { name: 'notary', type: 'address' },
      { name: 'ipfsCid', type: 'bytes32' },
      { name: 'docType', type: 'bytes32' },
      { name: 'stateCode', type: 'bytes32' },
      { name: 'fee', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
    ],
  },
  buildEip712Domain: (...args: unknown[]) => h.buildEip712Domain(...args),
  buildNotaryAttestationMessage: (args: Record<string, unknown>) => {
    h.buildNotaryAttestationMessage(args);
    // Full v2.0 field set (uint256 fields coerced) so `hashTypedData` over the
    // pinned typehash can never throw regardless of caller shape.
    const message: Record<string, unknown> = { ...args };
    for (const key of ['fee', 'timestamp', 'deadline', 'nonce']) {
      message[key] = BigInt((args[key] ?? 0) as string | number | bigint);
    }
    return message;
  },
  buildSignerAcknowledgmentMessage: (args: Record<string, unknown>) => {
    h.buildSignerAcknowledgmentMessage(args);
    const message: Record<string, unknown> = { ...args };
    for (const key of ['fee', 'timestamp', 'deadline', 'nonce']) {
      message[key] = BigInt((args[key] ?? 0) as string | number | bigint);
    }
    return message;
  },
  verifySignature: (...args: unknown[]) => h.verifySignature(...args),
  signNotaryAttestation: vi.fn(),
  signSignerAcknowledgment: vi.fn(),
}));

vi.mock('@/lib/attest', () => ({
  issueNotarialActAttestation: (...args: unknown[]) => h.issueNotarialActAttestation(...args),
  getAttestation: vi.fn(),
  revokeNotarialActAttestation: vi.fn(),
  getEasConfig: vi.fn(),
}));

vi.mock('@/lib/contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/contract')>();
  return {
    ...actual,
    getNotaryRegistryAddress: () => h.getNotaryRegistryAddress(),
    isNotaryActive: (...args: unknown[]) => h.isNotaryActive(...args),
  };
});

vi.mock('@/lib/kv', () => ({
  cacheAct: (...args: unknown[]) => h.cacheAct(...args),
  getCachedAct: vi.fn(),
  cacheNotaryStats: vi.fn(),
  getCachedNotaryStats: vi.fn(),
}));

vi.mock('@/app/api/_lib/kv-extras', () => ({
  cacheActExtras: (...args: unknown[]) => h.cacheActExtras(...args),
  getCachedActExtras: vi.fn(),
  cacheOtsProof: vi.fn(),
  getCachedOtsProof: vi.fn(),
  cachePendingCommission: vi.fn(),
}));

vi.mock('@/app/api/_lib/web3-provider', () => ({
  getServerPublicClient: () => ({
    getTransactionReceipt: h.getTransactionReceipt,
    readContract: h.readContract,
  }),
  createRelayerProvider: () => ({
    request: (args: { method: string; params?: unknown[] }) =>
      args.method === 'eth_getTransactionReceipt'
        ? h.rpcGetTransactionReceipt()
        : Promise.reject(new Error(`unexpected rpc method ${args.method}`)),
  }),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { POST } from '@/app/api/notarize/route';

const TOKEN_ENV = 'NOTARIZE_API_TOKEN';
const TOKEN = 'test-notarize-token';
const REGISTRY = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const;
const OTHER_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const;

const DOC_HASH = `0x${'11'.repeat(32)}` as Hex;
const TX_HASH = `0x${'44'.repeat(32)}` as Hex;
const NOTARY = `0x${'aa'.repeat(20)}` as const;
const SIGNER = `0x${'bb'.repeat(20)}` as const;
const IPFS_CID = `0x${'cc'.repeat(32)}` as Hex;
const DOC_TYPE = `0x${'dd'.repeat(32)}` as Hex;
const STATE_CODE = `0x${'ee'.repeat(32)}` as Hex;
const SIG = `0x${'22'.repeat(65)}` as Hex;
const SIG2 = `0x${'33'.repeat(65)}` as Hex;

const VALID_BODY = {
  docHash: DOC_HASH,
  notary: NOTARY,
  signer: SIGNER,
  ipfsCid: IPFS_CID,
  docType: DOC_TYPE,
  stateCode: STATE_CODE,
  fee: '1000000',
  timestamp: '1800000000',
  deadline: '1800003600',
  notarySig: SIG,
  signerSig: SIG2,
  txHash: TX_HASH,
};

/** The NotarialActRecorded event, in raw and decoded form (viem-compatible). */
function actLog(overrides: { docHash?: Hex; timestamp?: bigint } = {}) {
  const docHash = overrides.docHash ?? DOC_HASH;
  const timestamp = overrides.timestamp ?? 1_800_000_000n;
  const topics = encodeEventTopics({
    abi: [
      {
        type: 'event',
        name: 'NotarialActRecorded',
        inputs: [
          { name: 'docHash', type: 'bytes32', indexed: true },
          { name: 'notary', type: 'address', indexed: true },
          { name: 'signer', type: 'address', indexed: true },
          { name: 'ipfsCid', type: 'bytes32', indexed: false },
          { name: 'docType', type: 'bytes32', indexed: false },
          { name: 'stateCode', type: 'bytes32', indexed: false },
          { name: 'timestamp', type: 'uint256', indexed: false },
        ],
      },
    ],
    eventName: 'NotarialActRecorded',
    args: { docHash, notary: NOTARY, signer: SIGNER },
  });
  const data = encodeAbiParameters(
    [
      { name: 'ipfsCid', type: 'bytes32' },
      { name: 'docType', type: 'bytes32' },
      { name: 'stateCode', type: 'bytes32' },
      { name: 'timestamp', type: 'uint256' },
    ],
    [IPFS_CID, DOC_TYPE, STATE_CODE, timestamp],
  );
  return {
    address: REGISTRY,
    eventName: 'NotarialActRecorded',
    args: { docHash, notary: NOTARY, signer: SIGNER, ipfsCid: IPFS_CID, docType: DOC_TYPE, stateCode: STATE_CODE, timestamp },
    topics,
    data,
    logIndex: 0,
    blockNumber: 1n,
    transactionHash: TX_HASH,
  };
}

/** A successful receipt whose NotarialActRecorded args match the body. */
function goodReceipt(overrides: Record<string, unknown> = {}) {
  return {
    transactionHash: TX_HASH,
    transactionIndex: 0,
    blockHash: `0x${'55'.repeat(32)}`,
    blockNumber: 1n,
    from: SIGNER,
    to: REGISTRY,
    status: 'success',
    logs: [actLog()],
    ...overrides,
  };
}

function request(body: unknown, init: { token?: string | null; method?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = init.token === undefined ? TOKEN : init.token;
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/api/notarize', {
    method: init.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv(TOKEN_ENV, TOKEN);
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.verifySignature.mockReturnValue(true);
  h.buildEip712Domain.mockReturnValue({ name: 'OpenNotary', version: '1', chainId: 84532, verifyingContract: REGISTRY });
  h.getNotaryRegistryAddress.mockReturnValue(REGISTRY);
  h.isNotaryActive.mockResolvedValue(true);
  h.readContract.mockResolvedValue(0n);
  h.issueNotarialActAttestation.mockResolvedValue(`0x${'77'.repeat(32)}`);
  h.getTransactionReceipt.mockResolvedValue(goodReceipt());
  h.rpcGetTransactionReceipt.mockResolvedValue(goodReceipt());
  h.cacheAct.mockResolvedValue(undefined);
  h.cacheActExtras.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('POST /api/notarize — authentication', () => {
  test('test_api_notarize_rejectsMissingBearerWith401', async () => {
    const res = await POST(request(VALID_BODY, { token: null }));
    expect(res.status).toBe(401);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsWrongBearerWith401', async () => {
    const res = await POST(request(VALID_BODY, { token: 'wrong-token' }));
    expect(res.status).toBe(401);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsEmptyBearerWith401', async () => {
    const res = await POST(request(VALID_BODY, { token: '' }));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/notarize — payload validation', () => {
  test('test_api_notarize_rejectsMissingFieldsWith400Shape', async () => {
    const res = await POST(request({ docHash: DOC_HASH }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  test('test_api_notarize_rejectsMalformedHexWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, docHash: '0xnothex' }));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsShortSignatureWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, notarySig: `0x${'22'.repeat(32)}` }));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsNonNumericTimestampWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, timestamp: 'not-a-number' }));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsMalformedBodyJsonWith400', async () => {
    const res = await POST(
      new Request('http://localhost/api/notarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/notarize — signature verification', () => {
  test('test_api_notarize_rejectsInvalidNotarySigWith401', async () => {
    h.verifySignature.mockImplementation((args: { expected: string }) =>
      args.expected.toLowerCase() !== NOTARY.toLowerCase(),
    );
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid signature');
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsInvalidSignerSigWith401', async () => {
    h.verifySignature.mockImplementation((args: { expected: string }) =>
      args.expected.toLowerCase() !== SIGNER.toLowerCase(),
    );
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid signature');
  });

  test('test_api_notarize_rejectsBothSignaturesInvalidWith401', async () => {
    h.verifySignature.mockReturnValue(false);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(401);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_verifiesBothPartiesSignatures', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    expect(h.verifySignature).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/notarize — fee integrity', () => {
  test('test_api_notarize_rejectsFeeBelowTotalWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, fee: '999999' }));
    expect(res.status).toBe(400);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsFeeAboveTotalWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, fee: '1000001' }));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsZeroFeeWith400', async () => {
    const res = await POST(request({ ...VALID_BODY, fee: '0' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/notarize — receipt verification', () => {
  test('test_api_notarize_rejectsMissingReceiptWith400', async () => {
    h.getTransactionReceipt.mockRejectedValue(new Error('Transaction receipt not found'));
    h.rpcGetTransactionReceipt.mockResolvedValue(null);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsRevertedReceiptWith400', async () => {
    const receipt = goodReceipt({ status: 'reverted' });
    h.getTransactionReceipt.mockResolvedValue(receipt);
    h.rpcGetTransactionReceipt.mockResolvedValue(receipt);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsReceiptWithWrongToWith400', async () => {
    const receipt = goodReceipt({ to: OTHER_ADDRESS });
    h.getTransactionReceipt.mockResolvedValue(receipt);
    h.rpcGetTransactionReceipt.mockResolvedValue(receipt);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
  });

  test('test_api_notarize_rejectsReceiptWithMismatchedEventArgsWith400', async () => {
    const receipt = goodReceipt({ logs: [actLog({ docHash: `0x${'99'.repeat(32)}` as Hex })] });
    h.getTransactionReceipt.mockResolvedValue(receipt);
    h.rpcGetTransactionReceipt.mockResolvedValue(receipt);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_rejectsReceiptWithMismatchedTimestampArgWith400', async () => {
    const receipt = goodReceipt({ logs: [actLog({ timestamp: 1n })] });
    h.getTransactionReceipt.mockResolvedValue(receipt);
    h.rpcGetTransactionReceipt.mockResolvedValue(receipt);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/notarize — configuration', () => {
  test('test_api_notarize_returns503WhenRegistryIsUnconfigured', async () => {
    h.getNotaryRegistryAddress.mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set');
    });
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(503);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });

  test('test_api_notarize_returns503WhenApiTokenUnsetFailClosed', async () => {
    delete process.env[TOKEN_ENV];
    const res = await POST(request(VALID_BODY, { token: TOKEN }));
    expect(res.status).toBe(503);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });
});

describe('POST /api/notarize — notary standing', () => {
  test('test_api_notarize_rejectsInactiveNotaryWith400', async () => {
    h.isNotaryActive.mockResolvedValue(false);
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(400);
    expect(h.issueNotarialActAttestation).not.toHaveBeenCalled();
  });
});

describe('POST /api/notarize — happy path', () => {
  test('test_api_notarize_finalizesActAndReturnsOkShape', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attestationUid).toBe(`0x${'77'.repeat(32)}`);
    expect(h.issueNotarialActAttestation).toHaveBeenCalledTimes(1);
  });

  test('test_api_notarize_cachesActAndExtras', async () => {
    const res = await POST(request(VALID_BODY));
    expect(res.status).toBe(200);
    expect(h.cacheAct).toHaveBeenCalledTimes(1);
    expect(h.cacheActExtras).toHaveBeenCalledTimes(1);
  });

  test('test_api_notarize_acceptsBigIntStringsForFeeTimestampDeadline', async () => {
    const res = await POST(
      request({
        ...VALID_BODY,
        fee: '1000000',
        timestamp: '1800000000',
        deadline: '1800003600',
      }),
    );
    expect(res.status).toBe(200);
  });
});
