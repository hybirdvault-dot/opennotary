import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { keccak256, toBytes } from 'viem';

/**
 * Acceptance tests for src/lib/storage.ts (spec section 4).
 *
 * `@web3-storage/w3up-client` is mocked at the package boundary: `create`
 * resolves a client whose `uploadFile`/`get` behave like the real SDK. The
 * global fetch is also stubbed so gateway-based fetchByCid implementations see
 * consistent signals (same content on hit, 404 on miss).
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  uploadFile: vi.fn(),
  get: vi.fn(),
  parsePrincipal: vi.fn(),
  parseProof: vi.fn(),
  addSpace: vi.fn(),
  setCurrentSpace: vi.fn(),
  StoreMemory: vi.fn(),
}));

vi.mock('@web3-storage/w3up-client', () => ({
  create: (...args: unknown[]) => h.create(...args),
}));

vi.mock('@web3-storage/w3up-client/principal/ed25519', () => ({
  parse: (...args: unknown[]) => h.parsePrincipal(...args),
}));

vi.mock('@web3-storage/w3up-client/proof', () => ({
  parse: (...args: unknown[]) => h.parseProof(...args),
}));

vi.mock('@web3-storage/w3up-client/stores/memory', () => ({
  StoreMemory: class {
    constructor() {
      h.StoreMemory();
    }
  },
}));

const MOCK_SDK_CLIENT = {
  uploadFile: (...args: unknown[]) => h.uploadFile(...args),
  get: (...args: unknown[]) => h.get(...args),
  addSpace: (...args: unknown[]) => h.addSpace(...args),
  setCurrentSpace: (...args: unknown[]) => h.setCurrentSpace(...args),
};

const PRINCIPAL_ENV = 'W3_PRINCIPAL';
const PROOF_ENV = 'W3_PROOF';
const PRINCIPAL = 'did:key:z6Mkf-principal-for-tests';
const PROOF = 'ucan-proof-for-tests';
const CID_STRING = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const DOCUMENT_BODY = 'notarized document body';

function cidLink(cid: string): { toString(): string } {
  return { toString: () => cid };
}

function setTokenEnv(value: string | null): void {
  if (value === null) {
    vi.stubEnv(PRINCIPAL_ENV, '');
    delete process.env[PRINCIPAL_ENV];
    vi.stubEnv(PROOF_ENV, '');
    delete process.env[PROOF_ENV];
    return;
  }
  vi.stubEnv(PRINCIPAL_ENV, value);
  vi.stubEnv(PROOF_ENV, PROOF);
}

function fetchMock(impl: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('fetch', impl);
}

async function importStorage(): Promise<typeof import('@/lib/storage')> {
  vi.resetModules();
  return await import('@/lib/storage');
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue(MOCK_SDK_CLIENT);
  h.uploadFile.mockReset();
  h.get.mockReset();
  h.parsePrincipal.mockReset().mockReturnValue({ did: () => PRINCIPAL });
  h.parseProof.mockReset().mockResolvedValue({ ucan: true });
  h.addSpace.mockReset().mockResolvedValue({ did: () => 'did:key:z6Mkf-space-for-tests' });
  h.setCurrentSpace.mockReset().mockResolvedValue(undefined);
  h.StoreMemory.mockReset();
  setTokenEnv(PRINCIPAL);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('src/lib/storage', () => {
  describe('createStorageClient', () => {
    test('test_createStorageClient_throwsWhenUcanEnvIsMissing', async () => {
      setTokenEnv(null);
      const { createStorageClient } = await importStorage();

      await expect((async () => createStorageClient())()).rejects.toThrow(
        'W3_PRINCIPAL and W3_PROOF are not set',
      );
    });

    test('test_createStorageClient_buildsClientFromUcanEnv', async () => {
      const { createStorageClient } = await importStorage();

      const client = await createStorageClient();

      expect(client).toBeTruthy();
      expect(h.parsePrincipal).toHaveBeenCalledWith(PRINCIPAL);
      expect(h.create).toHaveBeenCalledTimes(1);
      expect(h.addSpace).toHaveBeenCalledTimes(1);
      expect(h.setCurrentSpace).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadDocument', () => {
    test('test_uploadDocument_uploadsFileAndReturnsCidString', async () => {
      h.uploadFile.mockResolvedValue(cidLink(CID_STRING));
      const storage = await importStorage();
      const client = await storage.createStorageClient();
      const file = new Blob([DOCUMENT_BODY], { type: 'application/pdf' });

      const result = await storage.uploadDocument(client as never, file);

      expect(h.uploadFile).toHaveBeenCalledTimes(1);
      expect(h.uploadFile.mock.calls[0][0]).toBe(file);
      expect(result).toEqual({ cid: CID_STRING });
      expect(typeof result.cid).toBe('string');
    });

    test('test_uploadDocument_propagatesUploadFailure', async () => {
      const failure = new Error('upload rejected');
      h.uploadFile.mockRejectedValue(failure);
      const storage = await importStorage();
      const client = await storage.createStorageClient();

      await expect(storage.uploadDocument(client as never, new Blob(['x']))).rejects.toBe(failure);
    });
  });

  describe('fetchByCid', () => {
    test('test_fetchByCid_returnsBlobContentForStoredDocument', async () => {
      h.get.mockResolvedValue(new Blob([DOCUMENT_BODY]));
      fetchMock(vi.fn().mockResolvedValue(new Response(DOCUMENT_BODY, { status: 200 })));
      const storage = await importStorage();
      const client = await storage.createStorageClient();

      const blob = await storage.fetchByCid(client as never, CID_STRING);

      expect(blob).not.toBeNull();
      expect(blob).toBeInstanceOf(Blob);
      expect(await (blob as Blob).text()).toBe(DOCUMENT_BODY);
    });

    test('test_fetchByCid_returnsNullWhenCidIsNotFound', async () => {
      // Absent document: the client resolves nothing and the gateway 404s.
      h.get.mockResolvedValue(null);
      fetchMock(vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));
      const storage = await importStorage();
      const client = await storage.createStorageClient();

      await expect(storage.fetchByCid(client as never, CID_STRING)).resolves.toBeNull();
    });

    test('test_fetchByCid_propagatesUnexpectedStorageFailure', async () => {
      const failure = new Error('storage cluster unavailable');
      h.get.mockRejectedValue(failure);
      fetchMock(vi.fn().mockRejectedValue(failure));
      const storage = await importStorage();
      const client = await storage.createStorageClient();

      await expect(storage.fetchByCid(client as never, CID_STRING)).rejects.toBe(failure);
    });
  });

  describe('cidToBytes32 / bytes32ToCid (re-exported from cid.ts)', () => {
    test('test_storageReexportsCidHelpersFromCidModule', async () => {
      const storage = await importStorage();
      const cid = await import('@/lib/cid');
      const digest = `0x${'cd'.repeat(32)}`;

      // The pinned pipeline: storage re-exports cid.ts's client-safe helpers.
      expect(storage.cidToBytes32(CID_STRING)).toBe(cid.cidToBytes32(CID_STRING));
      expect(storage.bytes32ToCid(digest)).toBe(cid.bytes32ToCid(digest));
    });

    test('test_storageCidToBytes32ReturnsRawDigestNotKeccakOfCidString', async () => {
      const { cidToBytes32 } = await importStorage();

      const value = cidToBytes32(CID_STRING);

      expect(value).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(value).not.toBe(keccak256(toBytes(CID_STRING)));
    });

    test('test_storageBytes32ToCidRoundTripsThroughCidToBytes32', async () => {
      const storage = await importStorage();
      const digest = `0x${'ab'.repeat(32)}`;

      expect(storage.cidToBytes32(storage.bytes32ToCid(digest))).toBe(digest);
    });
  });
});
