/**
 * Zod (v3) validation schemas for the OpenNotary forms and lookup inputs.
 *
 * Source pattern: zod docs (https://zod.dev).
 */
import { z } from 'zod';

/**
 * `0x`-prefixed 20-byte address literal.
 */
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 0x-prefixed 20-byte address');

/**
 * `0x`-prefixed 32-byte hex literal (doc hashes, schema UIDs, packed codes).
 */
const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Must be a 0x-prefixed 32-byte hex string');

/**
 * Packed state/jurisdiction code (2-4 characters).
 */
const stateCodeSchema = z.string().trim().min(2, 'State code must be 2-4 characters').max(4, 'State code must be 2-4 characters');

/**
 * Accepts unix seconds (number or numeric string) or an ISO date string and
 * normalizes everything to a unix-seconds number.
 */
const unixSecondsSchema = z.preprocess((value) => {
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }
  return value;
}, z.coerce.number().int());

/**
 * Validates admin `registerNotary` form input.
 */
export const notaryRegisterSchema = z.object({
  /** Address of the notary to register. */
  notary: addressSchema,
  /** `bytes32` hash referencing the notary's commissioning credentials. */
  commissionHash: bytes32Schema,
  /** State/jurisdiction code of the commission. */
  stateCode: stateCodeSchema,
  /** Commission expiry as ISO date or unix seconds; coerced to a number. */
  commissionExpiry: unixSecondsSchema,
});

/**
 * Validates signer `notarize` flow input (document + counterparties).
 */
export const notarizeSchema = z.object({
  /** Document to notarize: non-empty and at most 25MB. */
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, 'File must not be empty')
    .refine((file) => file.size <= 25 * 1024 * 1024, 'File must be 25MB or less'),
  /** Human-readable document type descriptor. */
  docType: z.string().trim().min(1, 'Document type must not be empty'),
  /** State/jurisdiction code the act is performed in. */
  stateCode: stateCodeSchema,
  /** Address of the party acknowledging the document. */
  signerAddress: addressSchema,
});

/**
 * Validates a verification lookup key: a `bytes32` document hash or an EAS
 * attestation UID, with or without the `0x` prefix.
 */
export const verifySchema = z.object({
  docHashOrUid: z
    .string()
    .regex(/^(0x)?[0-9a-fA-F]{64}$/, 'Must be a bytes32 hex or attestation UID'),
});

/**
 * Typed `registerNotary` form input.
 */
export type NotaryRegisterInput = z.infer<typeof notaryRegisterSchema>;

/**
 * Typed `notarize` form input.
 */
export type NotarizeInput = z.infer<typeof notarizeSchema>;

/**
 * Typed verification lookup input.
 */
export type VerifyInput = z.infer<typeof verifySchema>;
