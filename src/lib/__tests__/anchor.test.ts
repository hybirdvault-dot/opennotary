import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Hex } from 'viem';

/**
 * Acceptance tests for src/lib/anchor.ts (spec section 6).
 *
 * javascript-opentimestamps is mocked at the package boundary with the real
 * module surface (default + named exports): `stamp` mutates the detached
 * timestamp file, `DetachedTimestampFile.fromBytes` consumes the digest,
 * `serializeToBytes` yields the .ots proof bytes, and `verify` resolves the
 * Bitcoin block attestation or nothing while a proof is still pending.
 */

const PROOF_BYTES = new Uint8Array([0x00, 0x6f, 0x70, 0x65, 0x6e, 0x74, 0x69, 0x6d, 0x65, 0x73]);
const DIGEST = ('0x' + 'ab'.repeat(32)) as Hex;
const BLOCK_HEIGHT = 812_345;
const BLOCK_TIMESTAMP = 1_700_000_123;

const h = vi.hoisted(() => ({
  stamp: vi.fn(),
  verify: vi.fn(),
  upgrade: vi.fn(),
  digestInputs: [] as unknown[],
}));

vi.mock('javascript-opentimestamps', () => {
  class OpSHA256 {}
  class OpSHA1 {}
  class StreamDeserialization {}

  class DetachedTimestampFile {
    fileHashOp: unknown;
    timestamp: { serializeToBytes(): Uint8Array };

    constructor(fileHashOp: unknown, timestamp?: unknown) {
      this.fileHashOp = fileHashOp;
      this.timestamp = { serializeToBytes: () => PROOF_BYTES };
      if (timestamp !== undefined) {
        h.digestInputs.push(timestamp);
      }
    }

    static fromBytes(fileHashOp: unknown, bytes: unknown): DetachedTimestampFile {
      return new DetachedTimestampFile(fileHashOp, bytes);
    }

    static fromHash(fileHashOp: unknown, hash: unknown): DetachedTimestampFile {
      return new DetachedTimestampFile(fileHashOp, hash);
    }

    static deserialize(): DetachedTimestampFile {
      const instance = new DetachedTimestampFile(new OpSHA256());
      return instance;
    }

    fileDigest(): unknown {
      return h.digestInputs.length > 0 ? h.digestInputs[h.digestInputs.length - 1] : new Uint8Array();
    }

    serializeToBytes(): Uint8Array {
      return PROOF_BYTES;
    }
  }

  const mod = {
    stamp: (...args: unknown[]) => h.stamp(...args),
    verify: (...args: unknown[]) => h.verify(...args),
    upgrade: (...args: unknown[]) => h.upgrade(...args),
    DetachedTimestampFile,
    Ops: { OpSHA256, OpSHA1 },
    Context: { StreamDeserialization, StreamSerialization: class StreamSerialization {} },
    Timestamp: class Timestamp {},
    Calendar: {},
    Notary: { BitcoinBlockHeightAttestation: class BitcoinBlockHeightAttestation {} },
    Utils: {},
    info: () => '',
    json: () => '{}',
  };
  return { ...mod, default: mod };
});

function toHexLike(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (value instanceof Uint8Array) {
    return (
      '0x' + Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
    ).toLowerCase();
  }
  if (Array.isArray(value)) {
    return (
      '0x' + value.map((byte) => Number(byte).toString(16).padStart(2, '0')).join('')
    ).toLowerCase();
  }
  return String(value).toLowerCase();
}

async function importAnchor(): Promise<typeof import('@/lib/anchor')> {
  vi.resetModules();
  return await import('@/lib/anchor');
}

beforeEach(() => {
  h.stamp.mockReset();
  h.verify.mockReset();
  h.upgrade.mockReset().mockResolvedValue(undefined);
  h.digestInputs.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/anchor', () => {
  describe('stampHash', () => {
    test('test_stampHash_submitsDigestToCalendarAndReturnsProofBytes', async () => {
      h.stamp.mockResolvedValue(undefined);
      const { stampHash } = await importAnchor();

      const result = await stampHash({ digest: DIGEST });

      expect(h.stamp).toHaveBeenCalledTimes(1);
      expect(h.digestInputs.length).toBeGreaterThan(0);
      for (const submitted of h.digestInputs) {
        expect(toHexLike(submitted)).toBe(DIGEST.toLowerCase());
      }
      expect(result.otsProof).toBeInstanceOf(Uint8Array);
      expect(result.otsProof).toEqual(PROOF_BYTES);
    });

    test('test_stampHash_propagatesCalendarNetworkFailure', async () => {
      const failure = new Error('calendar network unreachable');
      h.stamp.mockRejectedValue(failure);
      const { stampHash } = await importAnchor();

      await expect(stampHash({ digest: DIGEST })).rejects.toBe(failure);
    });
  });

  describe('verifyAnchor', () => {
    test('test_verifyAnchor_returnsVerifiedTrueWithBitcoinAttestationDetails', async () => {
      // Real SDK: verify() resolves attestations grouped by chain name.
      h.verify.mockResolvedValue({
        bitcoin: { height: BLOCK_HEIGHT, timestamp: BLOCK_TIMESTAMP },
      });
      const { verifyAnchor } = await importAnchor();

      const result = await verifyAnchor({ digest: DIGEST, otsProof: PROOF_BYTES });

      expect(h.digestInputs.length).toBeGreaterThan(0);
      for (const submitted of h.digestInputs) {
        expect(toHexLike(submitted)).toBe(DIGEST.toLowerCase());
      }
      expect(result.verified).toBe(true);
      expect(result.bitcoinBlockHeight).toBe(BLOCK_HEIGHT);
      expect(result.timestamp).toBe(BigInt(BLOCK_TIMESTAMP));
    });

    test('test_verifyAnchor_returnsVerifiedFalseForPendingProofWithoutThrowing', async () => {
      h.upgrade.mockRejectedValue(new Error('PendingAttestationError'));
      h.verify.mockResolvedValue(undefined);
      const { verifyAnchor } = await importAnchor();

      const result = await verifyAnchor({ digest: DIGEST, otsProof: PROOF_BYTES });

      expect(result).toEqual({ verified: false });
    });

    test('test_verifyAnchor_propagatesUnexpectedVerificationFailure', async () => {
      const failure = new Error('bitcoin node unreachable');
      h.upgrade.mockResolvedValue(undefined);
      h.verify.mockRejectedValue(failure);
      const { verifyAnchor } = await importAnchor();

      await expect(verifyAnchor({ digest: DIGEST, otsProof: PROOF_BYTES })).rejects.toBe(failure);
    });
  });
});
