/**
 * Shared request-validation helpers for OpenNotary API routes.
 *
 * The scheme allowlist enforces that every user-supplied URL field is a plain
 * web URL: only `http:` and `https:` are accepted, so `javascript:`, `data:`,
 * `file:`, `vbscript:` and other dangerous schemes are rejected before any
 * downstream use (redirects, link rendering, outbound fetches).
 */
import { z } from 'zod';

/** URL schemes permitted anywhere a caller supplies a URL. */
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Returns whether a URL string parses and uses an allowed web scheme.
 *
 * The WHATWG parser happily accepts `javascript:alert(1)` and `data:...`, so
 * the protocol is checked explicitly rather than trusting `URL` parse success.
 *
 * @param value - Candidate URL string.
 * @returns `true` only for a parseable `http:`/`https:` URL.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Zod schema for a required user-supplied URL limited to `http`/`https`.
 * Blocks scheme-based XSS vectors (`javascript:`, `data:`) at parse time.
 */
export const httpUrlSchema = z
  .string()
  .url('Must be a valid URL')
  .refine(isHttpUrl, 'URL must use the http or https scheme');
