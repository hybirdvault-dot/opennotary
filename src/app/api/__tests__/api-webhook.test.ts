import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * API integrity tests for POST /api/webhook/outbound.
 *
 * Pinned contract:
 * - `Authorization: Bearer <WEBHOOK_API_TOKEN>` required → 401 otherwise,
 *   503 fail-closed when the token env is unset.
 * - SSRF vectors → 400 (guard `@/app/api/_lib/ssrf` over the target).
 * - 3xx redirect responses → 400 (redirects must never be delivered to).
 * - `WEBHOOK_SECRET` missing or shorter than 32 chars → 503.
 * - Payload > 100KB → 400.
 * - Happy path: Svix-style `X-OpenNotary-Signature: sha256=<hex>` header whose
 *   value equals HMAC-SHA256(node:crypto) of the delivered body.
 *
 * Delivery is DNS-pinned (`resolveSafeTarget` + `postPinned` over
 * `node:http(s)`), so the outbound transport — not `fetch` — is mocked at the
 * `node:http`/`node:https` boundary and the captured request is asserted.
 */

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  rateLimit: vi.fn(),
  request: vi.fn(),
  lastCall: null as null | { opts: Record<string, unknown>; body: string },
}));

vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => h.lookup(...args),
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  const patched = { ...actual, request: h.request };
  return { ...patched, default: patched };
});

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  const patched = { ...actual, request: h.request };
  return { ...patched, default: patched };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { POST } from '@/app/api/webhook/outbound/route';

const TOKEN_ENV = 'WEBHOOK_API_TOKEN';
const SECRET_ENV = 'WEBHOOK_SECRET';
const TOKEN = 'test-webhook-token';
const SECRET = 'webhook-secret-with-plenty-of-entropy-0123456789abcdef';

const TARGET = 'https://hooks.example.com/opennotary';

type TransportOutcome = { status: number; body?: string } | { error: Error };

/**
 * Stubs the pinned HTTP transport: captures the outgoing request (headers +
 * body) and answers with a synthetic response or error.
 */
function stubTransport(outcome: TransportOutcome): void {
  h.request.mockImplementation((opts: unknown, cb: (res: unknown) => void) => {
    h.lastCall = { opts: opts as Record<string, unknown>, body: '' };
    let onError: ((err: Error) => void) | undefined;
    const req = {
      setTimeout: vi.fn(),
      on: vi.fn((event: string, fn: (err: Error) => void) => {
        if (event === 'error') {
          onError = fn;
        }
        return req;
      }),
      write: (chunk: string | Buffer) => {
        h.lastCall!.body += String(chunk);
      },
      end: () => {
        queueMicrotask(() => {
          if ('error' in outcome) {
            onError?.(outcome.error);
            return;
          }
          const res = new EventEmitter() as EventEmitter & { statusCode: number };
          res.statusCode = outcome.status;
          cb(res);
          if (outcome.body) {
            res.emit('data', Buffer.from(outcome.body));
          }
          res.emit('end');
        });
      },
    };
    return req;
  });
}

function body(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    targetUrl: TARGET,
    event: 'act.recorded',
    payload: { docHash: `0x${'11'.repeat(32)}` },
    ...overrides,
  });
}

function request(raw: string, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request('http://localhost/api/webhook/outbound', {
    method: 'POST',
    headers,
    body: raw,
  });
}

/** Signature header of the last captured outbound request. */
function signatureHeader(): string | undefined {
  const headers = h.lastCall?.opts.headers as Record<string, string> | undefined;
  return headers?.['X-OpenNotary-Signature'];
}

beforeEach(() => {
  h.rateLimit.mockReturnValue({ success: true, reset: Date.now() + 60_000 });
  h.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  h.lastCall = null;
  vi.stubEnv(TOKEN_ENV, TOKEN);
  vi.stubEnv(SECRET_ENV, SECRET);
  stubTransport({ status: 200, body: '{}' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhook/outbound — authentication', () => {
  test('test_api_webhook_rejectsMissingBearerWith401', async () => {
    const res = await POST(request(body(), null));
    expect(res.status).toBe(401);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_rejectsWrongBearerWith401', async () => {
    const res = await POST(request(body(), 'wrong-token'));
    expect(res.status).toBe(401);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_returns503WhenApiTokenUnsetFailClosed', async () => {
    delete process.env[TOKEN_ENV];
    const res = await POST(request(body()));
    expect(res.status).toBe(503);
    expect(h.request).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhook/outbound — validation and SSRF', () => {
  test('test_api_webhook_rejectsMissingFieldsWith400', async () => {
    const res = await POST(request(JSON.stringify({ event: 'act.recorded' })));
    expect(res.status).toBe(400);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_rejectsMalformedJsonWith400', async () => {
    const res = await POST(request('{not json'));
    expect(res.status).toBe(400);
  });

  test.each([
    ['http://127.0.0.1/admin'],
    ['http://localhost:8080/admin'],
    ['http://169.254.169.254/latest/meta-data/'],
    ['http://[::ffff:7f00:1]/'],
    ['http://[::ffff:a9fe:a9fe]/'],
    ['http://[::ffff:127.0.0.1]/'],
    ['http://[::1]/'],
    ['http://10.0.0.1/'],
    ['http://192.168.1.1/'],
    ['http://172.20.1.1/'],
    ['http://2130706433/'],
    ['http://0177.0.0.1/'],
    ['http://0x7f000001/'],
    ['http://100.64.0.1/'],
    ['http://192.88.99.1/'],
    ['file:///etc/passwd'],
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['ftp://example.com/x'],
  ])('test_api_webhook_rejectsSsrfVector %s', async (targetUrl) => {
    const res = await POST(request(body({ targetUrl })));
    expect(res.status).toBe(400);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_rejectsOversizePayloadWith400', async () => {
    const raw = body({ payload: { blob: 'x'.repeat(110 * 1024) } });
    expect(raw.length).toBeGreaterThan(100 * 1024);
    const res = await POST(request(raw));
    expect(res.status).toBe(400);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_rejectsJavascriptSchemeTargetAtValidation', async () => {
    const res = await POST(request(body({ targetUrl: 'javascript:alert(1)' })));
    expect(res.status).toBe(400);
    expect(h.request).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhook/outbound — signing secret', () => {
  test('test_api_webhook_returns503WhenSecretMissing', async () => {
    vi.stubEnv(SECRET_ENV, '');
    delete process.env[SECRET_ENV]; // truly absent, not merely empty
    const res = await POST(request(body()));
    expect(res.status).toBe(503);
    expect(h.request).not.toHaveBeenCalled();
  });

  test('test_api_webhook_returns503WhenSecretTooShort', async () => {
    vi.stubEnv(SECRET_ENV, 'short');
    const res = await POST(request(body()));
    expect(res.status).toBe(503);
    expect(h.request).not.toHaveBeenCalled();
  });
});

describe('POST /api/webhook/outbound — redirect handling', () => {
  test.each([[301], [302], [303], [307], [308]])(
    'test_api_webhook_rejectsRedirectStatus%dWith400',
    async (status) => {
      stubTransport({
        status,
        body: '',
      });
      const res = await POST(request(body()));
      expect(res.status).toBe(400);
    },
  );
});

describe('POST /api/webhook/outbound — delivery', () => {
  test('test_api_webhook_deliversAndReturnsOkShape', async () => {
    const res = await POST(request(body()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.delivered).toBe(true);
    expect(json.statusCode).toBe(200);
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  test('test_api_webhook_signatureHeaderIsHmacSha256OfDeliveredBody', async () => {
    const res = await POST(request(body()));
    expect(res.status).toBe(200);

    const header = signatureHeader();
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);

    const deliveredBody = h.lastCall!.body;
    const expected = `sha256=${createHmac('sha256', SECRET).update(deliveredBody).digest('hex')}`;
    expect(header).toBe(expected);
  });

  test('test_api_webhook_signatureCoversEventAndPayloadBody', async () => {
    const raw = body({ event: 'act.revoked', payload: { docHash: `0x${'22'.repeat(32)}` } });
    await POST(request(raw));

    const deliveredBody = h.lastCall!.body;
    expect(deliveredBody).toContain('act.revoked');
    expect(deliveredBody).toContain(`0x${'22'.repeat(32)}`);
    expect(signatureHeader()).toBe(
      `sha256=${createHmac('sha256', SECRET).update(deliveredBody).digest('hex')}`,
    );
  });

  test('test_api_webhook_usesUniqueSignaturePerSecret', async () => {
    await POST(request(body()));
    const first = signatureHeader();
    vi.stubEnv(SECRET_ENV, 'a-different-webhook-secret-0123456789abcdef0123456789');
    await POST(request(body()));
    const second = signatureHeader();
    expect(first).not.toBe(second);
  });

  test('test_api_webhook_mapsUpstream5xxTo502WithStatusCode', async () => {
    stubTransport({ status: 500, body: 'boom' });
    const res = await POST(request(body()));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('delivery failed');
    expect(json.statusCode).toBe(500);
  });

  test('test_api_webhook_mapsNetworkFailureTo502WithZeroStatus', async () => {
    stubTransport({ error: new Error('ECONNREFUSED') });
    const res = await POST(request(body()));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.statusCode).toBe(0);
  });

  test('test_api_webhook_acceptsPayloadJustUnder100KB', async () => {
    const raw = body({ payload: { blob: 'x'.repeat(90 * 1024) } });
    const res = await POST(request(raw));
    expect(res.status).toBe(200);
    expect(h.request).toHaveBeenCalledTimes(1);
  });
});
