/**
 * POST /api/notary/register — record a pending notary commission.
 *
 * Validates `notaryRegisterSchema` input, stores the commission as a KV-only
 * pending record and returns the pinned response. Production: the relayer
 * registers the commission on-chain after the BLI attestation.
 */
import type { Hex } from 'viem';

import { notaryRegisterSchema } from '@/lib/schemas';
import { cachePendingCommission } from '@/app/api/_lib/kv-extras';
import { enforceRateLimit, jsonError, readJsonBody } from '@/app/api/_lib/http';

/**
 * Handles commission registration submissions.
 *
 * @returns `{ ok, notary, commissionExpiry, txHash, note }` on success; 400 on
 * an invalid payload; 429 when rate limited; 500 `{ error: 'internal' }` on
 * unexpected failure.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, 'notary/register');
  if (limited) {
    return limited;
  }

  try {
    const body = await readJsonBody(request);
    const parsed = notaryRegisterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'invalid payload', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { notary, commissionHash, stateCode, commissionExpiry } = parsed.data;
    await cachePendingCommission({
      notary: notary as Hex,
      commissionHash: commissionHash as Hex,
      stateCode,
      commissionExpiry,
      createdAt: Date.now(),
    });

    return Response.json({
      ok: true,
      notary,
      commissionExpiry,
      txHash: null,
      note: 'Production relayer registers on-chain after BLI attestation',
    });
  } catch {
    return jsonError(500, 'internal');
  }
}
