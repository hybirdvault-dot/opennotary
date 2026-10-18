/**
 * POST /api/anchor/btc — submit a digest to the OpenTimestamps calendar
 * network (Bitcoin anchoring).
 *
 * Internal + demo endpoint: `/api/notarize` fires it fire-and-forget after
 * the on-chain act is attested. Requires Bearer `ANCHOR_API_TOKEN` (fail-closed).
 * Returns the serialized proof as base64.
 */
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type { Hex } from 'viem';

import {
  enforceRateLimit,
  jsonError,
  readJsonBody,
  requireBearerToken,
} from '@/app/api/_lib/http';
import { cacheOtsProof } from '@/app/api/_lib/kv-extras';

export const runtime = 'nodejs';

/** Request payload: a single `bytes32` digest to anchor. */
const anchorBodySchema = z.object({
  digest: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a bytes32 hex string'),
});

/**
 * Handles Bitcoin anchoring requests.
 *
 * @returns `{ ok, otsProof }` with the proof as base64; 400 on an invalid
 * payload; 503 `{ error: 'calendar unavailable' }` when the OTS calendar
 * network fails; 500 `{ error: 'internal' }` otherwise.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, 'anchor/btc');
  if (limited) {
    return limited;
  }

  // Bearer auth, fail-closed when ANCHOR_API_TOKEN is unset.
  const authError = requireBearerToken(request, process.env.ANCHOR_API_TOKEN);
  if (authError) {
    return authError;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = anchorBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'invalid payload', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    try {
      // `lib/anchor` is imported lazily so the OpenTimestamps/bitcore-lib
      // stack only loads when a stamp is actually requested.
      const { stampHash } = await import('@/lib/anchor');
      const { otsProof } = await stampHash({ digest: parsed.data.digest as Hex });
      const otsProofBase64 = Buffer.from(otsProof).toString('base64');
      await cacheOtsProof(parsed.data.digest as Hex, otsProofBase64);
      return Response.json({ ok: true, otsProof: otsProofBase64 });
    } catch {
      return jsonError(503, 'calendar unavailable');
    }
  } catch {
    return jsonError(500, 'internal');
  }
}
