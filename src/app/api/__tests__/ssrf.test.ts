import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Security tests for the SSRF guard at src/app/api/_lib/ssrf.ts.
 *
 * Every vector from the pinned SSRF matrix must be REJECTED by
 * `isSafeTarget`: IPv4-mapped IPv6 literals (all canonical notations),
 * alternative IPv4 notations (decimal/octal/hex), loopback/link-local/
 * private/CGNAT/reserved ranges, localhost-style hostnames, ULA and
 * link-local IPv6, and non-http(s) schemes. Only public http(s) targets
 * pass — DNS answers are mocked so the suite is hermetic.
 */

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => h.lookup(...args),
}));

import { isPrivateIp, isSafeTarget } from '@/app/api/_lib/ssrf';

/** A globally routable answer used for the positive DNS cases. */
const PUBLIC_ANSWER = [{ address: '93.184.216.34', family: 4 }];

/** A fresh request against the guard with DNS primed to a public answer. */
async function guarded(url: string): Promise<boolean> {
  return isSafeTarget(url);
}

beforeEach(() => {
  h.lookup.mockReset().mockResolvedValue(PUBLIC_ANSWER);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isSafeTarget — protocol vectors', () => {
  test.each([
    ['file:///etc/passwd'],
    ['file://localhost/etc/passwd'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['ftp://example.com/secret'],
    ['gopher://example.com:70/1'],
    ['not a url'],
    [''],
    ['example.com'],
    ['//example.com/path'],
  ])('test_ssrf_rejects_nonHttpScheme_or_unparseable %s', async (url) => {
    expect(await guarded(url)).toBe(false);
  });

  test('test_ssrf_accepts_http_and_https_schemes', async () => {
    expect(await guarded('https://example.com/hook')).toBe(true);
    expect(await guarded('http://example.com/hook')).toBe(true);
  });
});

describe('isSafeTarget — IPv4-mapped IPv6 literal vectors', () => {
  test.each([
    ['http://[::ffff:7f00:1]/'], // hex-canonical 127.0.0.1
    ['http://[::ffff:a9fe:a9fe]/'], // hex-canonical 169.254.169.254
    ['http://[::ffff:127.0.0.1]/'], // dotted-quad tail 127.0.0.1
    ['http://[::ffff:169.254.169.254]/'], // dotted-quad tail metadata IP
    ['http://[::ffff:10.0.0.1]/'], // dotted-quad tail RFC1918
    ['http://[::ffff:0a00:1]/'], // hex-canonical 10.0.0.1
  ])('test_ssrf_rejects_ipv4MappedIpv6 %s', async (url) => {
    expect(await guarded(url)).toBe(false);
  });
});

describe('isSafeTarget — alternative IPv4 notation vectors', () => {
  test.each([
    ['http://2130706433/'], // decimal 127.0.0.1
    ['http://0177.0.0.1/'], // octal 127.0.0.1
    ['http://0x7f000001/'], // hex 127.0.0.1
    ['http://0177.0.0.1:8080/'],
    ['http://0x7f.0x0.0x0.0x1/'], // per-octet hex 127.0.0.1
  ])('test_ssrf_rejects_alternativeIpv4Notations %s', async (url) => {
    expect(await guarded(url)).toBe(false);
  });
});

describe('isSafeTarget — private/reserved IPv4 ranges', () => {
  test.each([
    ['http://169.254.169.254/'], // cloud metadata
    ['http://169.254.0.1/'],
    ['http://169.254.255.255/'],
    ['http://10.0.0.1/'],
    ['http://10.255.255.254/'],
    ['http://192.168.0.1/'],
    ['http://192.168.255.255/'],
    ['http://172.16.0.1/'],
    ['http://172.31.255.255/'],
    ['http://127.0.0.1/'],
    ['http://127.1.2.3/'],
    ['http://127.255.255.254/'],
    ['http://0.0.0.0/'],
    ['http://0/'], // canonicalizes to 0.0.0.0
    ['http://100.64.0.1/'], // CGNAT 100.64/10
    ['http://100.127.255.254/'],
    ['http://192.88.99.1/'], // 6to4 relay anycast 192.88.99.0/24
    ['http://192.0.0.1/'], // IETF protocol assignments 192.0.0.0/24
    ['http://198.18.0.1/'], // benchmarking 198.18/15
    ['http://198.19.255.255/'],
    ['http://224.0.0.1/'], // multicast
    ['http://255.255.255.255/'], // broadcast
  ])('test_ssrf_rejects_privateOrReservedIpv4 %s', async (url) => {
    expect(await guarded(url)).toBe(false);
  });

  test.each([
    ['http://93.184.216.34/'], // public
    ['http://172.32.0.1/'], // just outside 172.16/12
    ['http://100.128.0.1/'], // just outside 100.64/10
    ['http://192.88.100.1/'], // just outside 192.88.99/24
  ])('test_ssrf_accepts_publicIpv4Literal %s', async (url) => {
    expect(await guarded(url)).toBe(true);
    expect(h.lookup).not.toHaveBeenCalled();
  });
});

describe('isSafeTarget — IPv6 literal vectors', () => {
  test.each([
    ['http://[::1]/'], // loopback
    ['http://[::]/'], // unspecified
    ['http://[fc00::1]/'], // ULA fc00::/7
    ['http://[fd12:3456:789a::1]/'], // ULA fd00::/8
    ['http://[fe80::1]/'], // link-local fe80::/10
    ['http://[::127.0.0.1]/'], // IPv4-compatible loopback
    ['http://[64:ff9b::7f00:1]/'], // NAT64-wrapped loopback is still literal IPv6 → rejected
  ])('test_ssrf_rejects_ipv6Literal %s', async (url) => {
    expect(await guarded(url)).toBe(false);
  });
});

describe('isSafeTarget — localhost-style hostname vectors', () => {
  test.each([
    ['http://localhost/'],
    ['http://localhost:3000/'],
    ['http://LOCALHOST/'],
    ['http://LoCaLhOsT/'],
    ['http://localhost./'], // trailing dot
    ['http://sub.localhost/'],
    ['http://printer.local/'],
    ['http://db.internal/'],
    ['http://router.home.arpa/'],
    ['https://metadata.google.internal/computeMetadata/v1/'],
  ])('test_ssrf_rejects_localhostStyleHost %s', async (url) => {
    expect(await guarded(url)).toBe(false);
    expect(h.lookup).not.toHaveBeenCalled();
  });
});

describe('isSafeTarget — DNS resolution vectors', () => {
  test('test_ssrf_accepts_hostnameResolvingToPublicAddress', async () => {
    h.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    expect(await guarded('https://example.com/hook')).toBe(true);
    expect(h.lookup).toHaveBeenCalledWith('example.com', { all: true });
  });

  test('test_ssrf_rejects_hostnameResolvingToPrivateIpv4', async () => {
    h.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    expect(await guarded('https://internal.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameResolvingToMetadataIp', async () => {
    h.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    expect(await guarded('https://metadata.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameWithMixedPublicAndPrivateAnswers', async () => {
    h.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    expect(await guarded('https://rebinding.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameResolvingToIpv6Loopback', async () => {
    h.lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    expect(await guarded('https://v6.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameResolvingToIpv4MappedPrivate', async () => {
    // DNS answers can surface IPv4-mapped IPv6 in hex-canonical form.
    h.lookup.mockResolvedValue([{ address: '::ffff:7f00:1', family: 6 }]);
    expect(await guarded('https://mapped.example.com/hook')).toBe(false);
    h.lookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);
    expect(await guarded('https://mapped.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameResolvingToUla', async () => {
    h.lookup.mockResolvedValue([{ address: 'fc00::abcd', family: 6 }]);
    expect(await guarded('https://ula.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameWithNoAnswers', async () => {
    h.lookup.mockResolvedValue([]);
    expect(await guarded('https://empty.example.com/hook')).toBe(false);
  });

  test('test_ssrf_rejects_hostnameThatFailsToResolve', async () => {
    h.lookup.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await guarded('https://nxdomain.example.com/hook')).toBe(false);
  });
});

describe('isSafeTarget — public target positive controls', () => {
  test('test_ssrf_accepts_normalHttpsHost', async () => {
    h.lookup.mockResolvedValue(PUBLIC_ANSWER);
    expect(await guarded('https://hooks.legaltech-saas.example/events')).toBe(true);
  });

  test('test_ssrf_accepts_publicHostnameWithPortAndPath', async () => {
    h.lookup.mockResolvedValue([{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }]);
    expect(await guarded('https://example.com:8443/webhook/opennotary')).toBe(true);
  });
});

describe('isPrivateIp', () => {
  test('test_isPrivateIp_flagsLoopbackAndPrivateRanges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
  });

  test('test_isPrivateIp_flagsIpv6LoopbackUlaAndMapped', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true);
  });

  test('test_isPrivateIp_allowsPublicAddresses', () => {
    expect(isPrivateIp('93.184.216.34')).toBe(false);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
    expect(isPrivateIp('::ffff:93.184.216.34')).toBe(false);
  });

  test('test_isPrivateIp_blocksUnparseableValues', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
    expect(isPrivateIp('')).toBe(true);
    expect(isPrivateIp('999.999.999.999')).toBe(true);
    expect(isPrivateIp('::gggg')).toBe(true);
  });
});
