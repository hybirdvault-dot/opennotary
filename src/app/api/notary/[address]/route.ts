/**
 * GET /api/notary/[address] — notary dashboard data: commission record, all
 * act hashes and aggregate stats.
 *
 * Stats are derived from chain state on every request so revocations are
 * reflected immediately: earnings = one {@link NOTARY_FEE} per *non-revoked*
 * act (a revoked act no longer earns). `totalActs` counts every recorded act.
 * The computed stats are written to the `lib/kv` cache best-effort, but the
 * response is always the freshly derived value (chain is the source of truth).
 */
import type { Address, Hex } from 'viem';
import { zeroHash } from 'viem';

import {
  getAct,
  getActsByNotary,
  getNotary,
  getNotaryRegistryAddress,
  type NotaryRecord,
} from '@/lib/contract';
import { cacheNotaryStats, type NotaryStats } from '@/lib/kv';
import { NOTARY_FEE } from '@/lib/usdc';
import { enforceRateLimit, jsonError } from '@/app/api/_lib/http';
import { getServerPublicClient } from '@/app/api/_lib/web3-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** JSON-safe commission record (`commissionExpiry` as a decimal string). */
type SerializableNotaryRecord = Omit<NotaryRecord, 'commissionExpiry'> & {
  commissionExpiry: string;
};

/**
 * Handles notary dashboard lookups.
 *
 * @returns `{ notary, acts, stats }`; 400 on a malformed address; 500
 * `{ error: 'internal' }` on unexpected failure (never a raw stack).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  const limited = enforceRateLimit(request, 'notary/address');
  if (limited) {
    return limited;
  }

  try {
    const { address: rawAddress } = await params;
    const address = rawAddress.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      return jsonError(400, 'invalid address');
    }
    const notaryAddress = address as Address;

    // Registry not configured → clean 503 (never a raw 500).
    try {
      getNotaryRegistryAddress();
    } catch {
      return jsonError(503, 'registry not configured');
    }

    const client = getServerPublicClient();
    const [record, acts] = await Promise.all([
      getNotary(client, notaryAddress),
      getActsByNotary(client, notaryAddress),
    ]);

    const isEmptyRecord =
      record.commissionHash === zeroHash &&
      record.stateCode === zeroHash &&
      record.commissionExpiry === 0n &&
      record.active === false;
    const notary: SerializableNotaryRecord | null = isEmptyRecord
      ? null
      : { ...record, commissionExpiry: record.commissionExpiry.toString() };

    // Earnings exclude revoked acts: inspect each act's revoked flag on-chain
    // so a revocation is reflected immediately (chain is the source of truth).
    const revokedFlags = await Promise.all(
      acts.map(async (docHash): Promise<boolean> => {
        try {
          const act = await getAct(client, docHash as Hex);
          return act.revoked;
        } catch {
          // Unreadable act: exclude it from earnings (fail-safe, never
          // over-count a notary's earnings).
          return true;
        }
      }),
    );
    const nonRevokedCount = revokedFlags.filter((revoked) => !revoked).length;

    const stats: NotaryStats = {
      totalActs: acts.length,
      earnings: BigInt(nonRevokedCount) * NOTARY_FEE,
    };
    try {
      await cacheNotaryStats(notaryAddress, stats);
    } catch {
      // Cache write is best-effort; the derived value is the response.
    }

    return Response.json({
      notary,
      acts: acts as Hex[],
      stats: { totalActs: stats.totalActs, earnings: stats.earnings.toString() },
    });
  } catch {
    return jsonError(500, 'internal');
  }
}
