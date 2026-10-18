/**
 * Minimal ambient type declarations for the `multiformats` subpaths used by
 * `lib/cid` (and its tests).
 *
 * The installed `multiformats` package's `exports` map omits a `types`
 * condition, so TypeScript's `moduleResolution: bundler` cannot locate the
 * bundled `.d.ts` files and reports the modules as untyped. These declarations
 * cover the exact surface `lib/cid` uses; at runtime the real `multiformats`
 * package is still resolved (verified: CID.parse / CID.createV1 round-trip).
 *
 * This mirrors the existing `javascript-opentimestamps.d.ts` shim pattern.
 */
declare module 'multiformats/cid' {
  export interface MultihashDigest {
    code: number;
    size: number;
    digest: Uint8Array;
    bytes: Uint8Array;
  }

  export class CID {
    readonly version: number;
    readonly code: number;
    readonly multihash: MultihashDigest;
    toString(): string;
    static parse(source: string): CID;
    static createV1(code: number, digest: MultihashDigest): CID;
    static create(version: number, code: number, digest: MultihashDigest): CID;
  }
}

declare module 'multiformats/hashes/digest' {
  export interface MultihashDigest {
    code: number;
    size: number;
    digest: Uint8Array;
    bytes: Uint8Array;
  }

  export function create(code: number, digest: Uint8Array): MultihashDigest;
}
