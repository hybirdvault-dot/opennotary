/**
 * POST /api/webhook/outbound — deliver an event to a legaltech SaaS webhook.
 *
 * Sends a JSON body signed Svix-style:
 * `X-OpenNotary-Signature: sha256=<HMAC-SHA256 hex of the raw body with
 * WEBHOOK_SECRET>`. The secret is required and at least 32 chars (fail-closed —
 * never sign with an empty/short secret).
 *
 * Hardening:
 * - Bearer auth against `WEBHOOK_API_TOKEN`, fail-closed;
 * - SSRF-guarded by `@/app/api/_lib/ssrf`: only public http(s) targets are
 *   delivered (no IPv6 literals, no private/link-local/IPv4-mapped addresses),
 *   and the connection is pinned to the single verified IP so a DNS rebinding
 *   window cannot redirect the socket internally;
 * - redirects are never followed and any 3xx is rejected;
 * - the serialized payload is capped at 100 KB;
 * - `targetUrl` is scheme-allowlisted (http/https only).
 */
import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

import {
  enforceRateLimit,
  jsonError,
  readJsonBody,
  requireBearerToken,
} from '@/app/api/_lib/http';
import { postPinned, resolveSafeTarget } from '@/app/api/_lib/ssrf';
import { httpUrlSchema } from '@/app/api/_lib/validation';

export const runtime = 'nodejs';

/** Serialized webhook payload cap: 100 KB. */
const MAX_PAYLOAD_BYTES = 100 * 1024;

/** Coarse raw-request ceiling (bounds body parsing before the precise cap). */
const MAX_REQUEST_BYTES = 1024 * 1024;

/** Minimum acceptable length for `WEBHOOK_SECRET`. */
const MIN_SECRET_LENGTH = 32;

/** Request payload for one outbound webhook delivery. */
const webhookBodySchema = z.object({
  targetUrl: httpUrlSchema,
  event: z.string().min(1).max(120),
  payload: z.record(z.unknown()),
});

/**
 * Handles outbound webhook deliveries.
 *
 * @returns `{ delivered: true, statusCode }` on a 2xx delivery; 400 on an
 * invalid payload, blocked target, oversized payload or redirect; 401/503 on
 * auth/config failures; 502 `{ error: 'delivery failed', statusCode }`
 * otherwise; 500 `{ error: 'internal' }` on unexpected failure.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, 'webhook/outbound');
  if (limited) {
    return limited;
  }

  // Bearer auth, fail-closed when WEBHOOK_API_TOKEN is unset.
  const authError = requireBearerToken(request, process.env.WEBHOOK_API_TOKEN);
  if (authError) {
    return authError;
  }

  try {
    // WEBHOOK_SECRET fail-closed: never sign with a missing or short secret.
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      return jsonError(503, 'webhook not configured');
    }

    // Bound body parsing before the precise payload cap.
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (contentLength > MAX_REQUEST_BYTES) {
      return jsonError(400, 'payload too large');
    }

    const body = await readJsonBody(request);
    const parsed = webhookBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, 'invalid payload', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { targetUrl, event, payload } = parsed.data;

    // Serialized payload size cap (100 KB).
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadBytes > MAX_PAYLOAD_BYTES) {
      return jsonError(400, 'payload too large');
    }

    // SSRF: resolve the target and pin its single verified public IP.
    const target = await resolveSafeTarget(targetUrl);
    if (!target) {
      return jsonError(400, 'invalid target url');
    }

    const rawBody = JSON.stringify({ event, payload });
    const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Pinned delivery: no redirect following; a 3xx is surfaced and rejected.
    let delivery;
    try {
      delivery = await postPinned(target, {
        headers: {
          'content-type': 'application/json',
          'X-OpenNotary-Event': event,
          'X-OpenNotary-Signature': `sha256=${signature}`,
        },
        body: rawBody,
      });
    } catch {
      return jsonError(502, 'delivery failed', { statusCode: 0 });
    }

    if (delivery.status >= 300 && delivery.status < 400) {
      return jsonError(400, 'redirects not allowed');
    }
    if (delivery.status >= 200 && delivery.status < 300) {
      return Response.json({ delivered: true, statusCode: delivery.status });
    }
    return jsonError(502, 'delivery failed', { statusCode: delivery.status });
  } catch {
    return jsonError(500, 'internal');
  }
}
