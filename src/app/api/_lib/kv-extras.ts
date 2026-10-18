/**
 * Route-scope KV metadata that complements the pinned `src/lib/kv.ts`
 * read-through cache (which owns the `act:` and `stats:` keys). Stores the
 * demo extras the verify API surfaces: pending commissions, attestation UIDs,
 * retrieval URIs and OpenTimestamps proofs. KV is never the source of truth —
 * every helper no-ops gracefully when KV is unconfigured.
 */
import { kv } from '@vercel/kv';
import type { Hex } from 'viem';

/** Seconds in 24 hours — TTL applied to every cached extra. */
const TTL_SECONDS = 24 * 60 * 60;

/** A notary commission awaiting production relayer registration. */
export type PendingCommission = {
  notary: Hex;
  commissionHash: Hex;
  stateCode: string;
  commissionExpiry: number;
  createdAt: number;
};

/** Per-act extras cached after a successful `/api/notarize` submission. */
export type ActExtras = {
  attestationUid?: Hex;
  txHash?: Hex;
  ipfsUri?: string;
  otsDigest?: Hex;
};

/** Returns whether Vercel KV credentials are present in the environment. */
function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Records a pending notary commission (cache-only demo index).
 *
 * No-op when KV is not configured.
 */
export async function cachePendingCommission(record: PendingCommission): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }
  await kv.set(`commission:${record.notary}`, record, { ex: TTL_SECONDS });
}

/**
 * Caches per-act extras under `act-extras:<docHash>` (24h TTL).
 *
 * No-op when KV is not configured.
 */
export async function cacheActExtras(docHash: Hex, extras: ActExtras): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }
  await kv.set(`act-extras:${docHash}`, extras, { ex: TTL_SECONDS });
}

/**
 * Reads cached per-act extras.
 *
 * @returns The extras, or `null` on a cache miss or when KV is unconfigured.
 */
export async function getCachedActExtras(docHash: Hex): Promise<ActExtras | null> {
  if (!isKvConfigured()) {
    return null;
  }
  const cached = await kv.get<ActExtras>(`act-extras:${docHash}`);
  return cached ?? null;
}

/**
 * Caches a serialized (base64) OpenTimestamps proof under `ots:<digest>`.
 *
 * No-op when KV is not configured.
 */
export async function cacheOtsProof(digest: Hex, otsProofBase64: string): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }
  await kv.set(`ots:${digest}`, otsProofBase64, { ex: TTL_SECONDS });
}

/**
 * Reads a cached OpenTimestamps proof.
 *
 * @returns Base64 proof bytes, or `null` on a cache miss or when KV is
 * unconfigured.
 */
export async function getCachedOtsProof(digest: Hex): Promise<string | null> {
  if (!isKvConfigured()) {
    return null;
  }
  const cached = await kv.get<string>(`ots:${digest}`);
  return cached ?? null;
}
