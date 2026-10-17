/**
 * Bitcoin anchoring of document digests via the OpenTimestamps calendar
 * network.
 *
 * `stampHash` submits a digest to the public calendars and returns the
 * (initially pending) OTS proof; `verifyAnchor` upgrades the proof and checks
 * it against the Bitcoin chain.
 *
 * Source pattern: opentimestamps/javascript-opentimestamps.
 */
import * as OpenTimestamps from 'javascript-opentimestamps';
import { hexToBytes, type Hex } from 'viem';

/**
 * Result of {@link verifyAnchor}.
 */
export type AnchorVerification = {
  /** Whether a Bitcoin attestation confirms the digest. */
  verified: boolean;
  /** Height of the attesting Bitcoin block (when verified). */
  bitcoinBlockHeight?: number;
  /** Unix timestamp attested to by the Bitcoin block (when verified). */
  timestamp?: bigint;
};

/**
 * Whether an error reported by the OpenTimestamps library means the proof is
 * still pending at the calendars (not an invalid proof).
 */
function isPendingProofError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().includes('pending');
}

/**
 * Normalizes the library's per-chain verify output (or its inner attestation
 * shape) into a bigint-typed anchor result.
 */
function toAnchorVerification(outputs: unknown): AnchorVerification {
  const bitcoin = (outputs as { bitcoin?: Record<string, unknown> } | null | undefined)?.bitcoin;
  if (!bitcoin) {
    return { verified: false };
  }

  const rawHeight = bitcoin.height;
  const rawTime = bitcoin.timestamp ?? bitcoin.attestedTime;
  if (rawHeight === undefined || rawTime === undefined) {
    return { verified: false };
  }

  return {
    verified: true,
    bitcoinBlockHeight: Number(rawHeight),
    timestamp: typeof rawTime === 'bigint' ? rawTime : BigInt(Math.trunc(Number(rawTime))),
  };
}

/**
 * Submits `digest` to the OpenTimestamps calendar network and returns the
 * resulting proof bytes (pending until the calendars upgrade it).
 *
 * @param params - Digest to anchor as a `0x`-prefixed 32-byte hex string.
 * @returns The serialized OpenTimestamps proof for the digest.
 * @throws Calendar/network errors; they propagate unwrapped.
 */
export async function stampHash(params: { digest: Hex }): Promise<{ otsProof: Uint8Array }> {
  const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    hexToBytes(params.digest),
  );
  await OpenTimestamps.stamp(detached);

  const serialized: Uint8Array | number[] = detached.serializeToBytes();
  return {
    otsProof: serialized instanceof Uint8Array ? serialized : Uint8Array.from(serialized),
  };
}

/**
 * Upgrades `otsProof` at the calendars and verifies it against the Bitcoin
 * chain.
 *
 * @param params - The digest that was stamped and its OpenTimestamps proof.
 * @returns `verified: false` (without throwing) while the proof is still
 * pending at the calendars; otherwise the Bitcoin attestation details.
 * @throws Malformed-proof and network errors; they propagate unwrapped.
 */
export async function verifyAnchor(params: {
  digest: Hex;
  otsProof: Uint8Array;
}): Promise<AnchorVerification> {
  const detachedStamped = OpenTimestamps.DetachedTimestampFile.deserialize(params.otsProof);
  const detachedOriginal = OpenTimestamps.DetachedTimestampFile.fromHash(
    new OpenTimestamps.Ops.OpSHA256(),
    hexToBytes(params.digest),
  );

  try {
    // `verify` upgrades pending timestamps before checking them against the
    // Bitcoin chain.
    const outputs: unknown = await OpenTimestamps.verify(detachedStamped, detachedOriginal);
    return toAnchorVerification(outputs);
  } catch (err) {
    if (isPendingProofError(err)) {
      return { verified: false };
    }
    throw err;
  }
}
