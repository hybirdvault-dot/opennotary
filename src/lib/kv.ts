/**
 * Vercel KV read-through cache for notarial data.
 *
 * KV is a performance cache only — the chain remains the source of truth. All
 * entry points degrade gracefully to no-ops when `KV_REST_API_URL` /
 * `KV_REST_API_TOKEN` are unset (e.g. local development).
 *
 * Source pattern: vercel/storage kv examples.
 */
import { kv } from '@vercel/kv';
import type { Address, Hex } from 'viem';

import type { NotarialAct } from './contract';

/**
 * Seconds in 24 hours; the TTL applied to every cached entry.
 */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * JSON-safe `NotarialAct`: `bigint` fields travel as decimal strings because
 * KV values are JSON-encoded.
 */
type CachedNotarialAct = Omit<NotarialAct, 'timestamp'> & { timestamp: string };

/**
 * JSON-safe per-notary stats: `earnings` travels as a decimal string.
 */
type CachedNotaryStats = { totalActs: number; earnings: string };

/**
 * Per-notary aggregate statistics derived from a notary's acts.
 */
export type NotaryStats = { totalActs: number; earnings: bigint };

/**
 * Returns whether Vercel KV credentials are present in the environment.
 */
function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Caches a notarial act under `act:<docHash>` with a 24h TTL.
 *
 * No-op when KV is not configured. KV errors propagate unwrapped.
 *
 * @param docHash - Content hash identifying the act.
 * @param act - Act to cache.
 */
export async function cacheAct(docHash: Hex, act: NotarialAct): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }
  const cached: CachedNotarialAct = { ...act, timestamp: act.timestamp.toString() };
  await kv.set(`act:${docHash}`, cached, { ex: TTL_SECONDS });
}

/**
 * Reads a cached notarial act.
 *
 * @param docHash - Content hash identifying the act.
 * @returns The cached act, or `null` on a cache miss or when KV is not
 * configured. KV errors propagate unwrapped.
 */
export async function getCachedAct(docHash: Hex): Promise<NotarialAct | null> {
  if (!isKvConfigured()) {
    return null;
  }
  const cached = await kv.get<CachedNotarialAct>(`act:${docHash}`);
  if (!cached) {
    return null;
  }
  return { ...cached, timestamp: BigInt(cached.timestamp) };
}

/**
 * Caches a notary's aggregate stats under `stats:<address>` with a 24h TTL.
 *
 * No-op when KV is not configured. KV errors propagate unwrapped.
 *
 * @param address - Address of the notary.
 * @param stats - Aggregate stats to cache.
 */
export async function cacheNotaryStats(address: Address, stats: NotaryStats): Promise<void> {
  if (!isKvConfigured()) {
    return;
  }
  const cached: CachedNotaryStats = {
    totalActs: stats.totalActs,
    earnings: stats.earnings.toString(),
  };
  await kv.set(`stats:${address}`, cached, { ex: TTL_SECONDS });
}

/**
 * Reads cached notary stats.
 *
 * @param address - Address of the notary.
 * @returns The cached stats, or `null` on a cache miss or when KV is not
 * configured. KV errors propagate unwrapped.
 */
export async function getCachedNotaryStats(address: Address): Promise<NotaryStats | null> {
  if (!isKvConfigured()) {
    return null;
  }
  const cached = await kv.get<CachedNotaryStats>(`stats:${address}`);
  if (!cached) {
    return null;
  }
  return { totalActs: cached.totalActs, earnings: BigInt(cached.earnings) };
}
