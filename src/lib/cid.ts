/**
 * Client-safe, pure CID <-> `bytes32` conversion for the `ipfsCid` field the
 * `NotaryRegistry` stores on-chain.
 *
 * The on-chain value is the RAW 32-byte sha2-256 digest of the document's CID
 * multihash (not a keccak of the CID string), so any sha2-256 CIDv1 can be
 * reconstructed from its on-chain digest alone. `bytes32ToCid` rebuilds a
 * dag-pb (0x70) CIDv1 — the codec Web3.Storage/w3up pins files under — making
 * `bytes32ToCid(cidToBytes32(cid))` lossless for sha2-256 dag-pb CIDs.
 *
 * This module is intentionally pure (no w3up/SDK/network imports) so it is safe
 * to import from client components and server code alike. The single source of
 * truth for these conversions lives here; `lib/storage` re-exports them.
 */
import { CID } from 'multiformats/cid';
import { create as createDigest } from 'multiformats/hashes/digest';
import type { Hex } from 'viem';

/** Multihash code for sha2-256 — the only hash `NotaryRegistry` accepts. */
const SHA2_256 = 0x12;

/** Multicodec code for dag-pb — the codec w3up pins files under. */
const DAG_PB = 0x70;

/** sha2-256 digest length in bytes. */
const DIGEST_LENGTH = 32;

/** Converts a 32-byte digest to its `0x`-prefixed hex form. */
function toHex32(bytes: Uint8Array): Hex {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

/**
 * Parses a `0x`-prefixed 32-byte hex string into bytes.
 *
 * @throws `Error('Digest must be 32 bytes')` when the hex is not 32 bytes.
 */
function fromHex32(hex: Hex): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (raw.length !== DIGEST_LENGTH * 2) {
    throw new Error('Digest must be 32 bytes');
  }
  const bytes = new Uint8Array(DIGEST_LENGTH);
  for (let i = 0; i < DIGEST_LENGTH; i += 1) {
    bytes[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Extracts the raw sha2-256 digest of a CID as the `bytes32` value stored
 * on-chain as `ipfsCid`.
 *
 * @param cid - A CID string (e.g. the w3up file CID shown to the user).
 * @returns The 32-byte sha2-256 multihash digest as `0x`-prefixed hex.
 * @throws `Error('Not a sha2-256 CID')` when `cid` cannot be parsed as a CID or
 * its multihash is not a 32-byte sha2-256 digest.
 */
export function cidToBytes32(cid: string): Hex {
  let digest: Uint8Array;
  let hashCode: number;
  try {
    const parsed = CID.parse(cid);
    digest = parsed.multihash.digest;
    hashCode = parsed.multihash.code;
  } catch {
    throw new Error('Not a sha2-256 CID');
  }
  if (hashCode !== SHA2_256 || digest.length !== DIGEST_LENGTH) {
    throw new Error('Not a sha2-256 CID');
  }
  return toHex32(digest);
}

/**
 * Rebuilds a dag-pb CIDv1 from a `bytes32` sha2-256 digest — the inverse of
 * {@link cidToBytes32}.
 *
 * @param digest - The `0x`-prefixed 32-byte digest (from {@link cidToBytes32}).
 * @returns A dag-pb (0x70) CIDv1 string, e.g. `bafybei…`.
 * @throws `Error('Digest must be 32 bytes')` when `digest` is not 32 bytes.
 */
export function bytes32ToCid(digest: Hex): string {
  const bytes = fromHex32(digest);
  return CID.createV1(DAG_PB, createDigest(SHA2_256, bytes)).toString();
}
