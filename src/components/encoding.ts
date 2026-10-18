/**
 * Small pure encoding/formatting helpers shared by OpenNotary UI components.
 *
 * These complement the `src/lib/` wrappers (which are pinned and tested) with
 * presentation-only utilities: bytes32 packing for contract fields and
 * explorer link builders. CID <-> bytes32 conversion lives in `src/lib/cid.ts`
 * (single source of truth) and is never fabricated client-side.
 */
import { type Hex } from 'viem';

/**
 * Packs a short UTF-8 string into a right-padded `bytes32` hex literal — the
 * on-chain encoding for `docType` and `stateCode`.
 *
 * @param text - String of at most 32 UTF-8 bytes.
 */
export function packBytes32(text: string): Hex {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 32) {
    throw new Error('Value exceeds 32 bytes');
  }
  const padded = new Uint8Array(32);
  padded.set(bytes);
  let hex = '';
  for (const byte of padded) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `0x${hex}`;
}

/**
 * Unpacks a right-padded UTF-8 `bytes32` hex literal back into a string.
 *
 * @param value - `0x`-prefixed 32-byte hex string.
 */
export function unpackBytes32(value: string): string {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2) || '0', 16);
  }
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }
  return new TextDecoder().decode(bytes.slice(0, end));
}

/**
 * Truncates a long hex/identifier for display: `0x1234…abcd`.
 *
 * @param value - Full identifier.
 * @param lead - Characters kept at the start (default 6).
 * @param tail - Characters kept at the end (default 4).
 */
export function truncateMiddle(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 1) {
    return value;
  }
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/**
 * Formats a 6-decimal USDC raw amount as a dollar string.
 *
 * @param raw - Raw USDC units (6 decimals), e.g. `1_000_000n` → `$1.00`.
 */
export function formatUsdc(raw: bigint): string {
  const sign = raw < 0n ? '-' : '';
  const abs = raw < 0n ? -raw : raw;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  return `${sign}$${whole.toString()}.${frac.toString().padStart(6, '0').slice(0, 2)}`;
}

/** Gateway URL for a pinned IPFS CID (w3link gateway used by Web3.Storage). */
export function ipfsGatewayUrl(cid: string): string {
  return `https://w3s.link/ipfs/${cid}`;
}

/** Base Sepolia explorer link for a transaction. */
export function basescanTxUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

/** Base Sepolia explorer link for an address. */
export function basescanAddressUrl(address: string): string {
  return `https://sepolia.basescan.org/address/${address}`;
}

/** EAS scan link for an attestation UID (Base Sepolia). */
export function easscanAttestationUrl(uid: string): string {
  return `https://base-sepolia.easscan.org/attestation/view/${uid}`;
}
