/**
 * IPFS document storage via Web3.Storage (w3up).
 *
 * Documents are uploaded as single blobs and retrieved either through the
 * client's `get` or the public IPFS gateway. The `ipfsCid` value the
 * `NotaryRegistry` stores on-chain is derived from the CID's sha2-256 digest
 * via {@link cidToBytes32} / {@link bytes32ToCid} — re-exported here from
 * `lib/cid` as the single source of truth so the client and server agree.
 *
 * Note: w3up clients authenticate through UCAN delegations rather than bearer
 * tokens. Server deployments supply `W3_PRINCIPAL` (the agent DID) and
 * `W3_PROOF` (a UCAN delegation exported by the `w3` CLI) — see `.env.example`.
 *
 * Source pattern: web3-storage/w3up examples.
 */
import { create, type Client } from '@web3-storage/w3up-client';
import { parse as parsePrincipal } from '@web3-storage/w3up-client/principal/ed25519';
import { parse as parseProof } from '@web3-storage/w3up-client/proof';
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory';

export { bytes32ToCid, cidToBytes32 } from './cid';

/**
 * Public IPFS gateway used when a client cannot fetch content directly.
 */
const IPFS_GATEWAY_URL = 'https://w3s.link/ipfs';

/**
 * A Web3.Storage client handle. Structural on purpose: w3up clients and
 * compatible test doubles can be passed anywhere a `StorageClient` is
 * expected. Handles are also thenable and resolve to the underlying w3up
 * client.
 */
export interface StorageClient {
  /** Uploads a file and resolves to its content identifier. */
  uploadFile(file: Blob): Promise<unknown>;
  /** Retrieves content by CID, or a gateway-style response. */
  get(cid: string): Promise<unknown>;
}

/**
 * Builds a Web3.Storage client from w3up UCAN credentials (`W3_PRINCIPAL` +
 * `W3_PROOF`).
 *
 * @throws `Error('W3_PRINCIPAL and W3_PROOF are not set')` when either
 * variable is missing.
 */
export function createStorageClient(): StorageClient {
  const principalStr = process.env.W3_PRINCIPAL;
  const proofStr = process.env.W3_PROOF;
  if (!principalStr || !proofStr) {
    throw new Error('W3_PRINCIPAL and W3_PROOF are not set (w3up UCAN credentials)');
  }

  const ready: Promise<Client> = (async () => {
    const principal = parsePrincipal(principalStr);
    const client = await create({ principal, store: new StoreMemory() });
    const space = await client.addSpace(await parseProof(proofStr));
    await client.setCurrentSpace(space.did());
    return client;
  })();

  const handle: StorageClient & PromiseLike<Client> = {
    uploadFile: (file: Blob) => ready.then((client) => client.uploadFile(file)),
    get: (cid: string) => ready.then((client) => getClientContent(client, cid)),
    then: (onfulfilled, onrejected) => ready.then(onfulfilled, onrejected),
  };
  return handle;
}

/**
 * Uploads a document and returns its CID.
 *
 * @param client - Storage client (or a promise of one).
 * @param file - Document content to upload.
 * @returns The content identifier of the stored document.
 * @throws Storage/network errors unwrapped.
 */
export async function uploadDocument(
  client: StorageClient,
  file: Blob,
): Promise<{ cid: string }> {
  const resolved = (await client) as Partial<StorageClient>;
  if (typeof resolved.uploadFile !== 'function') {
    throw new Error('Storage client does not support uploads');
  }
  const link = await resolved.uploadFile(file);
  return { cid: toCidString(link) };
}

/**
 * Fetches a document by CID.
 *
 * @param client - Storage client (or a promise of one).
 * @param cid - Content identifier of the document.
 * @returns The document content, or `null` when the CID cannot be resolved.
 * @throws Storage/network errors unwrapped.
 */
export async function fetchByCid(
  client: StorageClient,
  cid: string,
): Promise<Blob | null> {
  const resolved = (await client) as Partial<StorageClient>;
  const content =
    typeof resolved.get === 'function' ? await resolved.get(cid) : await fetchFromGateway(cid);
  return toBlob(content);
}

/**
 * Retrieves content through the client's own `get` when it has one, falling
 * back to the public gateway.
 */
async function getClientContent(client: Client, cid: string): Promise<unknown> {
  const getter = (client as Partial<StorageClient>).get;
  return typeof getter === 'function' ? getter.call(client, cid) : fetchFromGateway(cid);
}

/**
 * Retrieves content from the public IPFS gateway.
 */
async function fetchFromGateway(cid: string): Promise<Blob | null> {
  const response = await fetch(`${IPFS_GATEWAY_URL}/${cid}`);
  return response.ok ? response.blob() : null;
}

/**
 * Normalizes the many shapes storage backends return for a CID into its
 * `0x`-free string form (CID links, `{ cid }` envelopes, or plain strings).
 */
function toCidString(link: unknown): string {
  if (typeof link === 'string') {
    return link;
  }
  const nested = (link as { cid?: unknown } | null | undefined)?.cid;
  if (typeof nested === 'string') {
    return nested;
  }
  return String(link);
}

/**
 * Normalizes fetched content (a `Blob`, a gateway-style `Response`, or raw
 * bytes) into a `Blob`, or `null` when nothing is there.
 */
async function toBlob(content: unknown): Promise<Blob | null> {
  if (content === null || content === undefined) {
    return null;
  }
  if (content instanceof Blob) {
    return content;
  }
  const response = content as { ok?: boolean; blob?: unknown };
  if (typeof response.blob === 'function') {
    if (response.ok === false) {
      return null;
    }
    return (response.blob as () => Promise<Blob>)();
  }
  if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
    return new Blob([content as BlobPart]);
  }
  return null;
}
