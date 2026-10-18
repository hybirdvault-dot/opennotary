import { describe, expect, test } from 'vitest';
import { keccak256, toBytes } from 'viem';

import { bytes32ToCid, cidToBytes32 } from '@/lib/cid';

/**
 * Acceptance tests for src/lib/cid.ts — the client-safe pure ipfsCid pipeline.
 *
 * Pinned contract:
 * - `cidToBytes32(cid)`: `CID.parse`, require multihash 0x12/32 (sha2-256,
 *   32-byte digest), return the RAW digest as `Hex` bytes32.
 * - `bytes32ToCid(digest)`: `CID.createV1(0x70 dag-pb, sha2-256 multihash)`.
 * - Round-trip `bytes32ToCid` → `cidToBytes32` is lossless.
 *
 * Vectors below were produced with `multiformats` over the UTF-8 bytes of
 * `opennotary-cid-test` (digest
 * `ab8f0aac64c4becd911661639b07f229c3e8ea2e61bf2af750f06d484d5f7fd4`).
 */

/** Raw sha2-256 digest of `opennotary-cid-test`. */
const RAW_DIGEST = '0xab8f0aac64c4becd911661639b07f229c3e8ea2e61bf2af750f06d484d5f7fd4';

/** CIDv0 (base58btc, dag-pb, sha2-256) of `opennotary-cid-test`. */
const CID_V0 = 'QmZtLw3hXSG3PkZX51kUtK5RsoQCLuZHcLca1y8JGkRvSf';

/** CIDv1 (base32, dag-pb 0x70, sha2-256) of `opennotary-cid-test`. */
const CID_V1_DAG_PB = 'bafybeiflr4fkyzgex3gzcftbmonqp4rjypuoultbx4vpouhqnvee2x372q';

/** CIDv1 (base32, raw 0x55, sha2-256 — the `bafkrei…` style) of the same bytes. */
const CID_V1_RAW = 'bafkreiflr4fkyzgex3gzcftbmonqp4rjypuoultbx4vpouhqnvee2x372q';

/** CIDv1 whose multihash is `identity` (code 0x00) — not sha2-256. */
const CID_IDENTITY_MH = 'bafyaaaybaibq';

/** CIDv1 whose multihash is sha2-512 (code 0x13) — not 0x12/32. */
const CID_SHA2_512 =
  'bafybgqgnndaoxiynncnfys7idnb5glah3qrkshmsjjgh2hfw7ww3qam4zirnptmpojq4ceyyfedjnrumvctwoate5earmc6ltx35lr2gcks5c';

/** CIDv1 with a 0x12 multihash over a 31-byte digest — right code, wrong size. */
const CID_SHORT_DIGEST = 'bafybehyha4dqobyha4dqobyha4dqobyha4dqobyha4dqobyh';

/** CIDv1 with a 0x12 multihash over a 33-byte digest — right code, wrong size. */
const CID_LONG_DIGEST = 'bafybeiiha4dqobyha4dqobyha4dqobyha4dqobyha4dqobyha4dqobyha4dq';

describe('src/lib/cid', () => {
  describe('cidToBytes32', () => {
    test('test_cidToBytes32_extractsRawDigestFromCidv1RawBafkrei', () => {
      expect(cidToBytes32(CID_V1_RAW)).toBe(RAW_DIGEST);
    });

    test('test_cidToBytes32_extractsRawDigestFromCidv1DagPb', () => {
      expect(cidToBytes32(CID_V1_DAG_PB)).toBe(RAW_DIGEST);
    });

    test('test_cidToBytes32_extractsRawDigestFromCidv0Qm', () => {
      expect(cidToBytes32(CID_V0)).toBe(RAW_DIGEST);
    });

    test('test_cidToBytes32_returnsBytes32HexShape', () => {
      const value = cidToBytes32(CID_V1_RAW);
      expect(value).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    test('test_cidToBytes32_returnsRawDigestNotKeccakOfCidString', () => {
      // Regression pin: the old pipeline hashed the CID STRING with keccak256;
      // the v2 pipeline returns the raw multihash digest.
      expect(cidToBytes32(CID_V1_RAW)).not.toBe(keccak256(toBytes(CID_V1_RAW)));
    });

    test('test_cidToBytes32_rejectsIdentityMultihash', () => {
      expect(() => cidToBytes32(CID_IDENTITY_MH)).toThrow();
    });

    test('test_cidToBytes32_rejectsSha2_512Multihash', () => {
      expect(() => cidToBytes32(CID_SHA2_512)).toThrow();
    });

    test('test_cidToBytes32_rejectsSha256CodeWith31ByteDigest', () => {
      expect(() => cidToBytes32(CID_SHORT_DIGEST)).toThrow();
    });

    test('test_cidToBytes32_rejectsSha256CodeWith33ByteDigest', () => {
      expect(() => cidToBytes32(CID_LONG_DIGEST)).toThrow();
    });

    test('test_cidToBytes32_rejectsEmptyString', () => {
      expect(() => cidToBytes32('')).toThrow();
    });

    test('test_cidToBytes32_rejectsNonCidText', () => {
      expect(() => cidToBytes32('not-a-cid')).toThrow();
      expect(() => cidToBytes32('hello world')).toThrow();
    });

    test('test_cidToBytes32_rejectsHexLiteralInsteadOfCid', () => {
      expect(() => cidToBytes32(RAW_DIGEST)).toThrow();
      expect(() => cidToBytes32('0x1234')).toThrow();
    });

    test('test_cidToBytes32_rejectsTruncatedCidv0', () => {
      expect(() => cidToBytes32(CID_V0.slice(0, CID_V0.length - 4))).toThrow();
    });
  });

  describe('bytes32ToCid', () => {
    test('test_bytes32ToCid_wrapsDigestAsCidv1DagPbSha256', () => {
      expect(bytes32ToCid(RAW_DIGEST)).toBe(CID_V1_DAG_PB);
    });

    test('test_bytes32ToCid_emitsBafybeiDagPbForm', () => {
      const cid = bytes32ToCid(RAW_DIGEST);
      expect(cid.startsWith('bafybei')).toBe(true);
    });

    test('test_bytes32ToCid_isDeterministicForZeroDigest', () => {
      const zero = `0x${'00'.repeat(32)}`;
      expect(bytes32ToCid(zero)).toBe(bytes32ToCid(zero));
      expect(bytes32ToCid(zero)).toMatch(/^bafybei[a-z2-7]+$/);
    });

    test('test_bytes32ToCid_rejectsWrongSizeDigest', () => {
      expect(() => bytes32ToCid(`0x${'11'.repeat(31)}`)).toThrow();
      expect(() => bytes32ToCid('0x1234')).toThrow();
      expect(() => bytes32ToCid('')).toThrow();
    });
  });

  describe('round-trip', () => {
    test('test_roundTrip_bytes32ToCidThenCidToBytes32IsLossless', () => {
      const digests = [
        RAW_DIGEST,
        `0x${'00'.repeat(32)}`,
        `0x${'ff'.repeat(32)}`,
        keccak256(toBytes('another deterministic digest')),
      ];
      for (const digest of digests) {
        expect(cidToBytes32(bytes32ToCid(digest))).toBe(digest.toLowerCase());
      }
    });

    test('test_roundTrip_allSupportedCidFormsCollapseToSameDigest', () => {
      const forms = [CID_V0, CID_V1_DAG_PB, CID_V1_RAW];
      const digests = forms.map((cid) => cidToBytes32(cid));
      expect(new Set(digests).size).toBe(1);
      expect(digests[0]).toBe(RAW_DIGEST);
    });

    test('test_roundTrip_digestToCidToDigestIsStableAcrossIterations', () => {
      let cid = bytes32ToCid(RAW_DIGEST);
      for (let i = 0; i < 3; i += 1) {
        cid = bytes32ToCid(cidToBytes32(cid));
      }
      expect(cid).toBe(CID_V1_DAG_PB);
      expect(cidToBytes32(cid)).toBe(RAW_DIGEST);
    });
  });
});
