/**
 * GET /api/verify/[docHash] — the full notarial act behind the public verify
 * page: on-chain act (`lib/contract`), the EAS attestation when one exists,
 * KV-cached extras and the OpenTimestamps (Bitcoin) anchor status — `pending`
 * until the proof verifies. Single source of truth for `/verify/[docHash]`.
 */
import { Buffer } from 'node:buffer';
import type { Hex } from 'viem';

import { getAttestation } from '@/lib/attest';
import { getAct, getNotaryRegistryAddress } from '@/lib/contract';
import { bytes32ToCid } from '@/lib/cid';
import { cacheAct } from '@/lib/kv';
import { getCachedActExtras, getCachedOtsProof } from '@/app/api/_lib/kv-extras';
import { enforceRateLimit, jsonError } from '@/app/api/_lib/http';
import { createRelayerProvider, getServerPublicClient } from '@/app/api/_lib/web3-provider';
import type {
  OtsStatus,
  SerializableAct,
  SerializableAttestation,
  VerifyResponse,
} from '@/app/api/_lib/verify-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Returns whether a thrown value is (or wraps) the contract's `ActNotFound()`
 * revert, walking the error cause chain the way viem's `BaseError` composes
 * messages (mirrors `lib/queries`). */
function isActNotFound(err: unknown): boolean {
  const needle = 'actnotfound';
  let current: unknown = err;
  while (current) {
    const candidate = current as {
      errorName?: unknown;
      name?: unknown;
      message?: unknown;
      shortMessage?: unknown;
      details?: unknown;
      data?: { errorName?: unknown } | undefined;
      cause?: unknown;
    };
    for (const value of [
      candidate.errorName,
      candidate.name,
      candidate.message,
      candidate.shortMessage,
      candidate.details,
      candidate.data?.errorName,
    ]) {
      if (typeof value === 'string' && value.toLowerCase().replace(/\s/g, '').includes(needle)) {
        return true;
      }
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * Handles public verification lookups.
 *
 * @returns The full act payload; 400 on a malformed `docHash`; 404
 * `{ error: 'not found' }` when no act exists; 500 `{ error: 'internal' }`
 * on unexpected failure (never a raw stack).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ docHash: string }> },
): Promise<Response> {
  const limited = enforceRateLimit(request, 'verify');
  if (limited) {
    return limited;
  }

  try {
    const { docHash: rawDocHash } = await params;
    const normalized = (rawDocHash.startsWith('0x') ? rawDocHash : `0x${rawDocHash}`).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
      return jsonError(400, 'invalid doc hash');
    }
    const docHash = normalized as Hex;

    // Registry not configured → clean 503 (never a raw 500).
    try {
      getNotaryRegistryAddress();
    } catch {
      return jsonError(503, 'registry not configured');
    }

    // Chain is the source of truth. On a successful read, populate the KV
    // read-through cache; on ActNotFound answer 404 ALWAYS — a cached act is
    // never served for a chain act that does not exist (phantom-acts bug).
    let act: SerializableAct;
    try {
      const onChain = await getAct(getServerPublicClient(), docHash);
      try {
        await cacheAct(docHash, onChain);
      } catch {
        // Cache write is best-effort; the chain value is the response.
      }
      act = { ...onChain, timestamp: onChain.timestamp.toString() };
    } catch (err) {
      if (isActNotFound(err)) {
        return jsonError(404, 'act not found');
      }
      return jsonError(500, 'internal');
    }

    const extras = await getCachedActExtras(docHash);

    // EAS attestation — resolved from the cached UID or an explicit `?uid=`.
    let attestation: SerializableAttestation | null = null;
    const uidParam = new URL(request.url).searchParams.get('uid');
    const uid = (uidParam ?? extras?.attestationUid ?? '').toLowerCase();
    if (/^0x[0-9a-f]{64}$/.test(uid)) {
      try {
        const record = await getAttestation({
          provider: createRelayerProvider(),
          uid: uid as Hex,
        });
        attestation = record ? { ...record, time: record.time.toString() } : null;
      } catch {
        attestation = null;
      }
    }

    // OpenTimestamps status — pending until the proof verifies against Bitcoin.
    let ots: OtsStatus = { status: 'pending' };
    const proofBase64 = extras?.otsDigest ? await getCachedOtsProof(extras.otsDigest) : null;
    if (extras?.otsDigest && proofBase64) {
      try {
        // `lib/anchor` is imported lazily: the OpenTimestamps stack must not
        // load until a proof actually needs verifying (it is heavy and its
        // `bitcore-lib` dependency is brittle at module-init time).
        const { verifyAnchor } = await import('@/lib/anchor');
        const verified = await verifyAnchor({
          digest: extras.otsDigest,
          otsProof: new Uint8Array(Buffer.from(proofBase64, 'base64')),
        });
        if (verified.verified) {
          ots = {
            status: 'verified',
            bitcoinBlockHeight: verified.bitcoinBlockHeight,
            timestamp: verified.timestamp?.toString(),
          };
        }
      } catch {
        ots = { status: 'pending' };
      }
    }

    // Derive the retrieval link from the ON-CHAIN ipfsCid (lossless multihash
    // digest) so the displayed CID is cryptographically bound to the signed
    // value — never a client-asserted extras field.
    let ipfsUri: string | null = null;
    try {
      ipfsUri = `https://${bytes32ToCid(act.ipfsCid)}.ipfs.w3s.link`;
    } catch {
      ipfsUri = null;
    }

    const response: VerifyResponse = {
      docHash,
      act,
      attestation,
      ots,
      ipfsUri,
      txHash: extras?.txHash ?? null,
    };
    return Response.json(response);
  } catch {
    return jsonError(500, 'internal');
  }
}
