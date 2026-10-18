/**
 * SSRF guard for outbound webhook delivery.
 *
 * Policy (belt and suspenders):
 * - protocols: http/https only;
 * - literal hosts: only plain hostnames and dotted-quad IPv4 are allowed —
 *   ANY bracketed IPv6 literal is rejected outright, because the WHATWG URL
 *   parser canonicalizes IPv4-mapped forms (e.g. `[::ffff:7f00:1]` for
 *   127.0.0.1) and textual pattern checks can be bypassed;
 * - dotted-quad IPv4 literals are vetted against the private/reserved ranges;
 * - plain hostnames must resolve, and EVERY resolved address (IPv4 and IPv6,
 *   including IPv4-mapped in both dotted and hex-canonical form) must be
 *   public.
 *
 * Delivery additionally pins the resolved address so a DNS-rebinding window
 * between validation and connection cannot redirect the socket to an internal
 * host: {@link resolveSafeTarget} returns the one verified public IP and
 * {@link postPinned} connects to exactly that IP (with the original hostname
 * preserved for the `Host` header and TLS servername / certificate identity),
 * never re-resolving the name at connect time.
 */
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

/** Hostname suffixes that must never be delivery targets. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/**
 * Returns whether a dotted-quad IPv4 literal is private, loopback,
 * link-local, carrier-grade NAT, multicast or otherwise reserved.
 */
function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map((part) => Number.parseInt(part, 10));
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && octets[2] === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/**
 * Expands an IPv6 literal into its 8 16-bit groups, handling `::` compression
 * and an embedded dotted-quad tail. Returns `null` when unparseable.
 */
function expandIpv6(ip: string): number[] | null {
  const [main] = ip.split('%');
  let text = main;
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const parts = dotted[1].split('.').map((part) => Number.parseInt(part, 10));
    const high = ((parts[0] << 8) | parts[1]).toString(16);
    const low = ((parts[2] << 8) | parts[3]).toString(16);
    text = text.slice(0, dotted.index) + `${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(':').filter((part) => part !== '') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter((part) => part !== '') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 0 : missing !== 0) {
    return null;
  }
  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'),
    ...right,
  ];
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? numbers : null;
}

/** Checks the IPv4 carried by two 16-bit IPv6 groups (mapped/compatible). */
function isEmbeddedIpv4Private(high: number, low: number): boolean {
  return isPrivateIpv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
}

/**
 * Returns whether an IPv6 literal is loopback, unspecified, ULA, link-local
 * or an IPv4-mapped/compatible form carrying a non-public IPv4 (checked in
 * every canonical notation).
 */
function isPrivateIpv6(ip: string): boolean {
  const groups = expandIpv6(ip.toLowerCase());
  if (!groups) {
    return true; // unparseable → block
  }
  const isZero = (index: number) => groups[index] === 0;
  // :: (unspecified) and ::1 (loopback)
  if (groups.every(isZero) || (groups.slice(0, 7).every(isZero) && groups[7] === 1)) {
    return true;
  }
  // fc00::/7 unique-local and fe80::/10 link-local
  if ((groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80) {
    return true;
  }
  // IPv4-mapped ::ffff:a.b.c.d and deprecated IPv4-compatible ::a.b.c.d —
  // both cover the hex-canonical forms like ::ffff:7f00:1.
  const headIsZero = groups.slice(0, 5).every(isZero);
  if (headIsZero && groups[5] === 0xffff) {
    return isEmbeddedIpv4Private(groups[6], groups[7]);
  }
  if (headIsZero && groups[5] === 0 && !(groups[6] === 0 && groups[7] === 0)) {
    return isEmbeddedIpv4Private(groups[6], groups[7]);
  }
  return false;
}

/**
 * Returns whether an IP literal (any family) is private/reserved. Unparseable
 * values are treated as private (block-by-default).
 */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateIpv4(ip);
  }
  if (version === 6) {
    return isPrivateIpv6(ip);
  }
  return true;
}

/**
 * A delivery target that has passed the SSRF policy, carrying the single
 * verified public IP the connection must be pinned to.
 */
export type SafeTarget = {
  /** Parsed target URL. */
  url: URL;
  /** Canonical lowercase hostname (never a bracketed IPv6 literal). */
  hostname: string;
  /** Effective TCP port (explicit, or 443/80 by scheme). */
  port: number;
  /** Address family of {@link pinnedIp}. */
  family: 4 | 6;
  /** The one verified-public IP to connect to (DNS pin). */
  pinnedIp: string;
};

/**
 * Resolves a delivery target against the SSRF policy and pins the verified IP.
 *
 * The hostname is resolved here with `dns.lookup(all: true)` and EVERY answer
 * is vetted in canonical form; the first (public) address is returned as the
 * pin so the actual connection never re-resolves the name.
 *
 * @param rawUrl - Candidate webhook target.
 * @returns The {@link SafeTarget} pin for a public http(s) target, or `null`
 * when the target is a non-web scheme, a literal/mapped/private address, a
 * blocked host, or resolves to any such address.
 */
export async function resolveSafeTarget(rawUrl: string): Promise<SafeTarget | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  // (a) Bracketed IPv6 literals (any, including IPv4-mapped hex forms) are
  // rejected outright.
  if (hostname.startsWith('[')) {
    return null;
  }
  const bare = hostname.replace(/\.$/, '');
  if (bare === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => bare.endsWith(suffix))) {
    return null;
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;

  const literalVersion = isIP(bare);
  if (literalVersion === 6) {
    return null;
  }
  if (literalVersion === 4) {
    if (isPrivateIpv4(bare)) {
      return null;
    }
    return { url, hostname: bare, port, family: 4, pinnedIp: bare };
  }

  // (b) Plain hostname: resolve and vet every answer in canonical form, then
  // pin the first public address so the connect step cannot be rebound.
  try {
    const addresses = await lookup(bare, { all: true });
    if (addresses.length === 0 || !addresses.every((entry) => !isPrivateIp(entry.address))) {
      return null;
    }
    const pin = addresses[0];
    return {
      url,
      hostname: bare,
      port,
      family: pin.family === 6 ? 6 : 4,
      pinnedIp: pin.address,
    };
  } catch {
    return null;
  }
}

/**
 * Validates a delivery target against the SSRF policy.
 *
 * @param rawUrl - Candidate webhook target.
 * @returns `true` only for public http(s) targets: no localhost, no private,
 * link-local, loopback or IPv4-mapped literals, and no host resolving to any
 * such address.
 */
export async function isSafeTarget(rawUrl: string): Promise<boolean> {
  return (await resolveSafeTarget(rawUrl)) !== null;
}

/** Result of a pinned outbound POST: raw status and (possibly partial) body. */
export type PinnedPostResult = { status: number; body: string };

/** Upper bound on how long a pinned delivery waits before aborting. */
const PINNED_TIMEOUT_MS = 10_000;

/**
 * POSTs to a {@link SafeTarget} over a socket pinned to its verified IP.
 *
 * The TCP connection goes straight to `pinnedIp` (no DNS at connect time),
 * while the original hostname is preserved for the `Host` header and the TLS
 * servername so certificate identity is still validated against the real host.
 * Redirects are never followed (this uses `http(s).request`, not `fetch`), so a
 * 3xx surfaces verbatim for the caller to reject.
 *
 * @param target - A pin from {@link resolveSafeTarget}.
 * @param options - Request headers and body.
 * @returns The raw HTTP status and response body.
 */
export function postPinned(
  target: SafeTarget,
  options: { headers: Record<string, string>; body: string },
): Promise<PinnedPostResult> {
  const isHttps = target.url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const path = `${target.url.pathname}${target.url.search}`;

  return new Promise<PinnedPostResult>((resolve, reject) => {
    const req = transport.request(
      {
        host: target.pinnedIp,
        port: target.port,
        path,
        method: 'POST',
        headers: { ...options.headers, Host: target.url.host },
        // TLS SNI + certificate identity use the real hostname even though the
        // socket connects to the pinned IP.
        servername: isHttps ? target.hostname : undefined,
        // `rejectUnauthorized` defaults to true: the cert must match hostname.
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(PINNED_TIMEOUT_MS, () => {
      req.destroy(new Error('pinned request timed out'));
    });
    req.on('error', reject);
    req.write(options.body);
    req.end();
  });
}
