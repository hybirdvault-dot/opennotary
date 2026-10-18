/**
 * Shared HTTP plumbing for OpenNotary API routes: JSON error envelopes, per-IP
 * rate limiting (10/min via {@link rateLimit}) and safe body parsing. Route
 * handlers never leak stack traces — unexpected failures map to
 * `{ error: 'internal' }`.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { rateLimit } from '@/lib/ratelimit';

/**
 * Default sliding-window limit applied to every API route (spec: 10/min per
 * IP).
 */
const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Compares two strings in constant time by digesting them first so length
 * differences never leak through `timingSafeEqual`.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a).digest();
  const digestB = createHash('sha256').update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Enforces Bearer-token authentication on a route, fail-closed.
 *
 * The token is compared in constant time against `Bearer <token>`. When the
 * expected token is not configured the route answers `503 { error: 'not
 * configured' }` rather than silently allowing traffic; a wrong or missing
 * header answers `401 { error: 'unauthorized' }`.
 *
 * @param request - Incoming request carrying the `Authorization` header.
 * @param token - The expected secret (usually `process.env.*_TOKEN`). An empty
 * or `undefined` value fails closed.
 * @returns `null` when authorized, otherwise the error `Response` to return.
 */
export function requireBearerToken(
  request: Request,
  token: string | undefined,
): Response | null {
  if (!token) {
    return jsonError(503, 'not configured');
  }
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${token}`;
  if (!timingSafeStringEqual(header, expected)) {
    return jsonError(401, 'unauthorized');
  }
  return null;
}

/**
 * Builds a JSON error response in the pinned envelope shape.
 *
 * @param status - HTTP status code.
 * @param error - Short machine-readable error token.
 * @param extra - Optional extra JSON fields (e.g. `statusCode`, `issues`).
 */
export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error, ...extra }, { status });
}

/**
 * Extracts a stable caller key (client IP) from the request for rate limiting.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'local';
  return ip;
}

/**
 * Enforces the per-IP sliding-window limit for one route.
 *
 * @param request - Incoming request (used to derive the caller key).
 * @param routeName - Route-scoped key namespace so limits are independent.
 * @returns `null` when the request may proceed, otherwise a 429 response.
 */
export function enforceRateLimit(request: Request, routeName: string): Response | null {
  const { success, reset } = rateLimit(`${routeName}:${clientKey(request)}`, {
    limit: DEFAULT_LIMIT,
    windowMs: DEFAULT_WINDOW_MS,
  });
  if (success) {
    return null;
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return Response.json(
    { error: 'rate limited', reset },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

/**
 * Parses a JSON request body without throwing.
 *
 * @returns The parsed value, or `null` when the body is absent or malformed.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
