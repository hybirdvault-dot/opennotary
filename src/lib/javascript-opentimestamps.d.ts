/**
 * Minimal ambient typings for `javascript-opentimestamps` (LGPL-3.0), which
 * ships no type declarations. Covers the API surface `src/lib/anchor.ts`
 * consumes.
 */
declare module 'javascript-opentimestamps' {
  /** SHA-256 file hash operation. */
  export class OpSHA256 {}

  /** File hash operations exposed by the library. */
  export const Ops: { OpSHA256: typeof OpSHA256 };

  /** An OpenTimestamps merkle timestamp over a message. */
  export class Timestamp {
    /** The message (digest) this timestamp commits to. */
    msg: number[];
  }

  /** A timestamp file for another file's digest. */
  export class DetachedTimestampFile {
    /**
     * Builds a detached timestamp file for an already-computed digest.
     *
     * @param fileHashOp - Hash operation the digest was produced with.
     * @param digest - The file's digest bytes.
     */
    static fromHash(
      fileHashOp: InstanceType<typeof OpSHA256> | unknown,
      digest: Uint8Array | number[],
    ): DetachedTimestampFile;

    /**
     * Parses a serialized detached timestamp file.
     *
     * @param buffer - Serialized proof bytes.
     */
    static deserialize(buffer: Uint8Array | number[]): DetachedTimestampFile;

    /** Serializes this proof to bytes. */
    serializeToBytes(): Uint8Array | number[];

    /** The digest of the timestamped file. */
    fileDigest(): number[];

    /** The merkle timestamp held by this file. */
    timestamp: Timestamp;
  }

  /**
   * Submits a detached timestamp file to the calendar network, mutating it in
   * place with the resulting attestations.
   */
  export function stamp(
    detached: DetachedTimestampFile | DetachedTimestampFile[],
    options?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Upgrades an incomplete timestamp from the calendars.
   *
   * @returns Whether the timestamp changed.
   */
  export function upgrade(
    detached: DetachedTimestampFile,
    options?: Record<string, unknown>,
  ): Promise<boolean>;

  /**
   * Upgrades and verifies a stamped proof against its original.
   *
   * @returns Verified attestations grouped by chain, e.g.
   * `{ bitcoin: { timestamp: number, height: number } }`.
   */
  export function verify(
    detachedStamped: DetachedTimestampFile,
    detachedOriginal: DetachedTimestampFile,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}
