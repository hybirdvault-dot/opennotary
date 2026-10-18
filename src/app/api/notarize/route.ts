/**
 * POST /api/notarize — finalize a notarial act after the client has recorded
 * it on-chain.
 *
 * Security pipeline (each step is a hard gate; nothing downstream runs unless
 * the previous step passed):
 *   (a) Bearer auth against `NOTARIZE_API_TOKEN`, fail-closed;
 *   (b) verify BOTH EIP-712 signatures (`lib/eip712`) over digests built from
 *       the body fields + per-account nonces read from chain;
 *   (c) cross-checks: distinct parties and the exact $1.00 USDC fee;
 *   (d) on-chain receipt verification (KILLER #3): the submitted `txHash` must
 *       be a mined, successful call to the registry that emitted a
 *       `NotarialActRecorded` event matching the payload;
 *   (e) the notary must be active on-chain;
 *   (f) only then issue the non-revocable NotarialAct EAS attestation
 *       (`lib/attest`) and fire-and-forget the Bitcoin anchor
 *       (`/api/anchor/btc`) with its Bearer `ANCHOR_API_TOKEN`;
 *   (g) cache the act (`lib/kv`) and respond.
 *
 * The relayer key never leaves server code. A client-asserted `txHash` is
 * never trusted on its own — it is proven by decoding the registry's own event
 * and matching it to the signed payload.
 */
import {
  concat,
  decodeEventLog,
  hashTypedData,
  keccak256,
  type Address,
  type Hex,
} from 'viem';
import { z } from 'zod';

import { issueNotarialActAttestation } from '@/lib/attest';
import { getNotaryRegistryAddress, isNotaryActive, notaryRegistryAbi } from '@/lib/contract';
import { verifySignature } from '@/lib/eip712';
import { cacheAct } from '@/lib/kv';
import { createRelayerProvider, getServerPublicClient } from '@/app/api/_lib/web3-provider';
import { cacheActExtras } from '@/app/api/_lib/kv-extras';
import {
  enforceRateLimit,
  jsonError,
  readJsonBody,
  requireBearerToken,
} from '@/app/api/_lib/http';
import { httpUrlSchema } from '@/app/api/_lib/validation';

export const runtime = 'nodejs';

/** Chain the typed-data domain is pinned to (Base Sepolia). */
const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Exact $1.00 notarization fee, in USDC (6 decimals): 990_000 + 10_000. */
const REQUIRED_FEE = 1_000_000n;

/**
 * EIP-712 domain (`EIP712("OpenNotary", "1")`) the `NotaryRegistry` verifies
 * signatures against. Built inline against the v2 pin so verification does not
 * depend on any non-pinned export.
 */
function buildDomain(registry: Address) {
  return {
    name: 'OpenNotary',
    version: '1',
    chainId: BASE_SEPOLIA_CHAIN_ID,
    verifyingContract: registry,
  } as const;
}

/**
 * v2 typehash: `NotaryAttestation(bytes32 docHash,address signer,bytes32
 * ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,
 * uint256 deadline,uint256 nonce)`.
 */
const NOTARY_ATTESTATION_TYPES = {
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
} as const;

/**
 * v2 typehash: `SignerAcknowledgment(bytes32 docHash,address notary,bytes32
 * ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,
 * uint256 deadline,uint256 nonce)`.
 */
const SIGNER_ACKNOWLEDGMENT_TYPES = {
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
} as const;

const hex32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a bytes32 hex string');
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 0x address');
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/, 'Must be a 65-byte hex signature');
const uintStringSchema = z.string().regex(/^\d+$/, 'Must be a non-negative integer string');

/**
 * Body contract v2: the signed act fields (`fee`/`timestamp`/`deadline` as
 * bigint strings per the pinned spec) plus the client-submitted `txHash` that
 * step (d) proves on-chain. `ipfsUri` is an optional retrieval URI whose scheme
 * is allowlisted (http/https only).
 */
const notarizeBodySchema = z.object({
  docHash: hex32Schema,
  notary: addressSchema,
  signer: addressSchema,
  ipfsCid: hex32Schema,
  docType: hex32Schema,
  stateCode: hex32Schema,
  fee: uintStringSchema,
  timestamp: uintStringSchema,
  deadline: uintStringSchema,
  notarySig: signatureSchema,
  signerSig: signatureSchema,
  txHash: hex32Schema,
  ipfsUri: httpUrlSchema.optional(),
});

/** Normalizes a hex/address string for case-insensitive comparison. */
const normalize = (value: string): string => value.toLowerCase();

/**
 * Handles notarial-act finalization.
 *
 * @returns `{ ok: true, attestationUid, otsQueued: true }` on success; 401 for
 * a bad token or signature; 400 on an invalid payload or a `txHash` that does
 * not prove the payload; 500 `{ error: 'internal' }` on unexpected failure.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, 'notarize');
  if (limited) {
    return limited;
  }

  // (a) Bearer auth, fail-closed when NOTARIZE_API_TOKEN is unset.
  const authError = requireBearerToken(request, process.env.NOTARIZE_API_TOKEN);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = notarizeBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'invalid payload', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const {
      docHash,
      notary,
      signer,
      ipfsCid,
      docType,
      stateCode,
      notarySig,
      signerSig,
      txHash,
      ipfsUri,
    } = parsed.data;
    const fee = BigInt(parsed.data.fee);
    const timestamp = BigInt(parsed.data.timestamp);
    const deadline = BigInt(parsed.data.deadline);

    // Registry must be configured before any chain read or digest build.
    let registryAddress: Address;
    try {
      registryAddress = getNotaryRegistryAddress();
    } catch {
      return jsonError(503, 'registry not configured');
    }

    // (b) Verify both EIP-712 signatures over the body fields + per-account
    // nonces read from chain (`nonces(notary)` / `nonces(signer)`).
    const publicClient = getServerPublicClient();
    const [notaryNonce, signerNonce] = await Promise.all([
      publicClient.readContract({
        address: registryAddress,
        abi: notaryRegistryAbi,
        functionName: 'nonces',
        args: [notary as Address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: registryAddress,
        abi: notaryRegistryAbi,
        functionName: 'nonces',
        args: [signer as Address],
      }) as Promise<bigint>,
    ]);

    const domain = buildDomain(registryAddress);
    const notaryDigest = hashTypedData({
      domain,
      types: NOTARY_ATTESTATION_TYPES,
      primaryType: 'NotaryAttestation',
      message: {
        docHash: docHash as Hex,
        signer: signer as Address,
        ipfsCid: ipfsCid as Hex,
        docType: docType as Hex,
        stateCode: stateCode as Hex,
        fee,
        timestamp,
        deadline,
        nonce: notaryNonce,
      },
    });
    const signerDigest = hashTypedData({
      domain,
      types: SIGNER_ACKNOWLEDGMENT_TYPES,
      primaryType: 'SignerAcknowledgment',
      message: {
        docHash: docHash as Hex,
        notary: notary as Address,
        ipfsCid: ipfsCid as Hex,
        docType: docType as Hex,
        stateCode: stateCode as Hex,
        fee,
        timestamp,
        deadline,
        nonce: signerNonce,
      },
    });

    const [notarySigOk, signerSigOk] = await Promise.all([
      verifySignature({
        expected: notary as Address,
        digest: notaryDigest,
        signature: notarySig as Hex,
      }),
      verifySignature({
        expected: signer as Address,
        digest: signerDigest,
        signature: signerSig as Hex,
      }),
    ]);
    if (!notarySigOk || !signerSigOk) {
      return jsonError(401, 'invalid signature');
    }

    // (c) Cross-checks: distinct parties and the exact $1.00 fee.
    if (normalize(notary) === normalize(signer)) {
      return jsonError(400, 'invalid payload');
    }
    if (fee !== REQUIRED_FEE) {
      return jsonError(400, 'invalid payload');
    }

    // (d) On-chain receipt verification (KILLER #3): prove the client-submitted
    // txHash is a mined, successful registry call that recorded THIS payload.
    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
    } catch {
      return jsonError(400, 'tx does not match payload');
    }
    if (receipt.status !== 'success') {
      return jsonError(400, 'tx reverted');
    }
    if (!receipt.to || normalize(receipt.to) !== normalize(registryAddress)) {
      return jsonError(400, 'tx does not match payload');
    }

    let recorded: {
      docHash: Hex;
      notary: Address;
      signer: Address;
      timestamp: bigint;
    } | null = null;
    for (const log of receipt.logs) {
      if (normalize(log.address) !== normalize(registryAddress)) {
        continue;
      }
      try {
        const decoded = decodeEventLog({
          abi: notaryRegistryAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'NotarialActRecorded') {
          recorded = decoded.args as unknown as {
            docHash: Hex;
            notary: Address;
            signer: Address;
            timestamp: bigint;
          };
          break;
        }
      } catch {
        // Not a decodable registry event; keep scanning.
      }
    }
    if (!recorded) {
      return jsonError(400, 'event not found');
    }
    if (
      normalize(recorded.docHash) !== normalize(docHash) ||
      normalize(recorded.notary) !== normalize(notary) ||
      normalize(recorded.signer) !== normalize(signer) ||
      recorded.timestamp !== timestamp
    ) {
      return jsonError(400, 'tx does not match payload');
    }

    // (e) The notary must be active and commissioned on-chain.
    const active = await isNotaryActive(publicClient, notary as Address);
    if (!active) {
      return jsonError(400, 'notary not active');
    }

    // (f) Issue the EAS NotarialAct attestation via the server-side relayer.
    const attestationUid = await issueNotarialActAttestation({
      signer: createRelayerProvider(),
      recipient: notary as Address,
      docHash: docHash as Hex,
      notary: notary as Address,
      signerAddr: signer as Address,
      ipfsCid: ipfsCid as Hex,
      docType: docType as Hex,
      stateCode: stateCode as Hex,
      timestamp,
      txHash: txHash as Hex,
    });

    // Fire-and-forget the Bitcoin anchor over keccak256(docHash+txHash+uid),
    // carrying the internal Bearer ANCHOR_API_TOKEN.
    const otsDigest = keccak256(concat([docHash as Hex, txHash as Hex, attestationUid]));
    void fetch(new URL('/api/anchor/btc', request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.ANCHOR_API_TOKEN ?? ''}`,
      },
      body: JSON.stringify({ digest: otsDigest }),
    }).catch(() => undefined);

    // (g) Cache the act + demo extras (KV is read-through cache, never truth).
    await cacheAct(docHash as Hex, {
      docHash: docHash as Hex,
      notary: notary as Address,
      signer: signer as Address,
      ipfsCid: ipfsCid as Hex,
      docType: docType as Hex,
      stateCode: stateCode as Hex,
      timestamp,
      revoked: false,
    });
    await cacheActExtras(docHash as Hex, {
      attestationUid,
      txHash: txHash as Hex,
      ipfsUri,
      otsDigest,
    });

    return Response.json({ ok: true, attestationUid, otsQueued: true });
  } catch {
    return jsonError(500, 'internal');
  }
}
