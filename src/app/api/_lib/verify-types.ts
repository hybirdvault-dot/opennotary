/**
 * Shared wire types for the `/api/verify/[docHash]` response, consumed by both
 * the route handler and the `/verify/[docHash]` client page (one source of
 * truth for the verify payload).
 */
import type { AttestationRecord } from '@/lib/attest';
import type { NotarialAct } from '@/lib/contract';
import type { Hex } from 'viem';

/** JSON-safe {@link NotarialAct}: `timestamp` travels as a decimal string. */
export type SerializableAct = Omit<NotarialAct, 'timestamp'> & { timestamp: string };

/** JSON-safe {@link AttestationRecord}: `time` travels as a decimal string. */
export type SerializableAttestation = Omit<AttestationRecord, 'time'> & { time: string };

/** Bitcoin anchoring status surfaced to the verify page. */
export type OtsStatus =
  | { status: 'pending' }
  | { status: 'verified'; bitcoinBlockHeight?: number; timestamp?: string };

/** Full verify payload returned by GET /api/verify/[docHash]. */
export type VerifyResponse = {
  docHash: Hex;
  act: SerializableAct;
  attestation: SerializableAttestation | null;
  ots: OtsStatus;
  ipfsUri: string | null;
  txHash: string | null;
};
