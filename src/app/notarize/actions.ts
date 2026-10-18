'use server';

/**
 * Server actions for the notarize wizard.
 *
 * - `uploadDocumentAction` pins the document to IPFS through `lib/storage` with
 *   the server-only `WEB3_STORAGE_TOKEN`, returning the real w3up CID (never a
 *   fabricated one).
 * - `submitNotarizeAction` forwards the finalized notarization (the SAME real
 *   CID, both EIP-712 signatures, the committed fee/deadline and the confirmed
 *   transaction hash) to `/api/notarize`, attaching the `NOTARIZE_API_TOKEN`
 *   bearer token from the server env so it never reaches the browser.
 *
 * Both return a graceful result the wizard can recover from.
 */
import { headers } from 'next/headers';

import { createStorageClient, uploadDocument } from '@/lib/storage';

/** Result of a wizard IPFS upload. */
export type UploadDocumentResult =
  | { ok: true; cid: string }
  | { ok: false; error: string };

/** The v2 `/api/notarize` request body the wizard submits (bigints as strings). */
export type SubmitNotarizeBody = {
  docHash: string;
  notary: string;
  signer: string;
  ipfsCid: string;
  docType: string;
  stateCode: string;
  fee: string;
  timestamp: string;
  deadline: string;
  notarySig: string;
  signerSig: string;
  txHash: string;
  /** Retrieval URI for the pinned document (cached for the verify page). */
  ipfsUri?: string;
};

/** Result of a notarize submission. */
export type SubmitNotarizeResult =
  | { ok: true; attestationUid: string }
  | { ok: false; error: string };

/**
 * Uploads a document to IPFS and returns its real CID.
 *
 * @param file - The document blob captured by the wizard.
 */
export async function uploadDocumentAction(file: File): Promise<UploadDocumentResult> {
  try {
    const client = createStorageClient();
    const { cid } = await uploadDocument(client, file);
    return { ok: true, cid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'IPFS upload failed' };
  }
}

/**
 * Resolves the app origin so a server action can call its own API route (the
 * request that invoked this action carries the host/proto headers).
 */
async function apiOrigin(): Promise<string> {
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host');
  const proto = store.get('x-forwarded-proto') ?? 'http';
  if (!host) {
    throw new Error('Cannot resolve the API origin for this request');
  }
  return `${proto}://${host}`;
}

/**
 * Submits a finalized notarization to `/api/notarize`.
 *
 * The token never reaches the client: it is read from `NOTARIZE_API_TOKEN` here
 * and attached as a bearer header server-side. The API verifies both EIP-712
 * signatures and the transaction receipt before attesting.
 *
 * @param body - The v2 notarize payload (see {@link SubmitNotarizeBody}).
 */
export async function submitNotarizeAction(body: SubmitNotarizeBody): Promise<SubmitNotarizeResult> {
  try {
    // Never send a placeholder tx hash — the API now verifies receipts.
    if (!body.txHash || body.txHash === '0x') {
      return { ok: false, error: 'A confirmed transaction hash is required before submitting.' };
    }

    const token = process.env.NOTARIZE_API_TOKEN;
    const origin = await apiOrigin();
    const response = await fetch(new URL('/api/notarize', origin), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      attestationUid?: string;
      error?: string;
    };
    if (!response.ok || !payload.ok || !payload.attestationUid) {
      return {
        ok: false,
        error:
          payload.error === 'invalid signature'
            ? 'The API rejected the signatures — please re-sign and retry.'
            : (payload.error ?? 'The notarization API request failed — retry from this step.'),
      };
    }
    return { ok: true, attestationUid: payload.attestationUid };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'The notarization request failed',
    };
  }
}
