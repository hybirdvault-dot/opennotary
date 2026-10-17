/**
 * EAS (Ethereum Attestation Service) issuance and lookup for OpenNotary.
 *
 * Backend-oriented helpers around the EAS SDK: notarial acts are attested
 * under the non-revocable NotarialAct schema, while notary commissions live
 * under the revocable NotaryCommission schema.
 *
 * The EAS SDK is ethers-based, so EIP-1193 wallet providers are bridged to an
 * ethers-compatible signer before use.
 *
 * Source pattern: ethereum-attestation-service/eas-is-true.
 */
import {
  EAS,
  SchemaEncoder,
  type Attestation,
  type TransactionSigner,
} from '@ethereum-attestation-service/eas-sdk';
import { zeroHash, type Address, type Hex } from 'viem';

/**
 * Minimal EIP-1193 provider shape, as exposed by browser wallets and wallet
 * connectors (e.g. wagmi's injected provider).
 */
export interface Eip1193Provider {
  /** Sends a JSON-RPC request through the wallet. */
  request(args: {
    method: string;
    params?: readonly unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
}

/**
 * Base Sepolia EAS contract (predeploy), overridable via
 * `NEXT_PUBLIC_EAS_CONTRACT`.
 */
const DEFAULT_EAS_CONTRACT = '0x4200000000000000000000000000000000000021';

/**
 * NotarialAct schema in the pinned field order:
 * `docHash, notary, signer, ipfsCid, docType, stateCode, timestamp, txHash`.
 */
const NOTARIAL_ACT_SCHEMA =
  'bytes32 docHash,address notary,address signer,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 timestamp,bytes32 txHash';

/**
 * Receipt-poll cadence and deadline for bridged transactions.
 */
const RECEIPT_POLL_INTERVAL_MS = 1_000;
const RECEIPT_POLL_ATTEMPTS = 120;

/**
 * An EAS attestation as recorded on-chain.
 */
export type AttestationRecord = {
  /** Attestation UID. */
  uid: Hex;
  /** UID of the schema the attestation was issued under. */
  schema: Hex;
  /** Address that created the attestation. */
  attester: Address;
  /** Address the attestation is about. */
  recipient: Address;
  /** Unix timestamp of attestation creation. */
  time: bigint;
  /** Whether the attestation has been revoked. */
  revoked: boolean;
  /** ABI-encoded schema data. */
  data: Hex;
};

/**
 * Resolves the EAS deployment and schema UIDs from the environment.
 *
 * @throws `Error` when `NEXT_PUBLIC_EAS_SCHEMA_UID_ACT` or
 * `NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY` is missing.
 */
export function getEasConfig(): {
  easAddress: Address;
  schemaUidAct: Hex;
  schemaUidNotary: Hex;
} {
  const easAddress = (process.env.NEXT_PUBLIC_EAS_CONTRACT ?? DEFAULT_EAS_CONTRACT) as Address;

  const schemaUidAct = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID_ACT;
  if (!schemaUidAct) {
    throw new Error('NEXT_PUBLIC_EAS_SCHEMA_UID_ACT is not set');
  }

  const schemaUidNotary = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY;
  if (!schemaUidNotary) {
    throw new Error('NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY is not set');
  }

  return {
    easAddress,
    schemaUidAct: schemaUidAct as Hex,
    schemaUidNotary: schemaUidNotary as Hex,
  };
}

/**
 * A JSON-RPC transaction request in EIP-1193 wire format.
 */
type RpcTransaction = Record<string, string>;

/**
 * An ethers-style transaction request as consumed by the EAS SDK's signer.
 */
type EthersTransactionRequest = Parameters<TransactionSigner['sendTransaction']>[0];

/**
 * Converts an ethers transaction request into EIP-1193 wire parameters.
 */
function toRpcTransaction(tx: EthersTransactionRequest): RpcTransaction {
  const rpc: RpcTransaction = {};
  if (typeof tx.from === 'string') {
    rpc.from = tx.from;
  }
  if (typeof tx.to === 'string') {
    rpc.to = tx.to;
  }
  if (typeof tx.data === 'string') {
    rpc.data = tx.data;
  }
  if (tx.value !== undefined && tx.value !== null) {
    const value = typeof tx.value === 'bigint' ? tx.value : BigInt(String(tx.value));
    rpc.value = `0x${value.toString(16)}`;
  }
  return rpc;
}

/**
 * Polls until `hash` is mined and returns a receipt carrying the tx hash and
 * logs the SDK parses for attestation UIDs.
 */
async function waitForTransactionReceipt(
  provider: Eip1193Provider,
  hash: string,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    const raw = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (raw) {
      const receipt = raw as { hash?: unknown; logs?: unknown };
      return {
        ...(raw as Record<string, unknown>),
        hash: typeof receipt.hash === 'string' ? receipt.hash : hash,
        logs: Array.isArray(receipt.logs) ? receipt.logs : [],
      };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS);
    });
  }
  throw new Error(`Transaction ${hash} was not mined in time`);
}

/**
 * Bridges an EIP-1193 wallet provider to the ethers-compatible signer surface
 * the EAS SDK sends transactions through.
 */
function toTransactionSigner(provider: Eip1193Provider): TransactionSigner {
  return {
    async resolveName(): Promise<string | null> {
      return null;
    },
    async estimateGas(tx: Parameters<TransactionSigner['estimateGas']>[0]): Promise<bigint> {
      const gas = await provider.request({ method: 'eth_estimateGas', params: [toRpcTransaction(tx)] });
      return BigInt(String(gas));
    },
    async call(tx: Parameters<TransactionSigner['call']>[0]): Promise<string> {
      const result = await provider.request({ method: 'eth_call', params: [toRpcTransaction(tx), 'latest'] });
      return String(result);
    },
    async sendTransaction(tx: EthersTransactionRequest) {
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [toRpcTransaction(tx)],
      });
      return {
        hash: String(hash),
        wait: () => waitForTransactionReceipt(provider, String(hash)),
      };
    },
  };
}

/**
 * Maps the SDK's `Attestation` struct to {@link AttestationRecord}.
 */
function toAttestationRecord(attestation: Attestation): AttestationRecord {
  const explicitRevoked = (attestation as { revoked?: boolean }).revoked;
  const revocationTime = attestation.revocationTime;
  return {
    uid: attestation.uid as Hex,
    schema: attestation.schema as Hex,
    attester: attestation.attester as Address,
    recipient: attestation.recipient as Address,
    time: BigInt(attestation.time),
    revoked:
      explicitRevoked ??
      (revocationTime === undefined ? false : BigInt(revocationTime) !== 0n),
    data: attestation.data as Hex,
  };
}

/**
 * Whether an error from the EAS SDK means the attestation does not exist.
 */
function isNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.toLowerCase().replace(/\s/g, '').includes('notfound');
}

/**
 * Issues a non-revocable NotarialAct attestation and returns its UID.
 *
 * The schema data is encoded in the pinned field order `docHash, notary,
 * signer, ipfsCid, docType, stateCode, timestamp, txHash`.
 *
 * @param params - EIP-1193 signer plus the act's attestation fields.
 * @returns The attestation UID as a `bytes32` hex string.
 * @throws `Error` when the EAS schema UIDs are not configured, or any SDK/RPC
 * error unwrapped.
 */
export async function issueNotarialActAttestation(params: {
  signer: Eip1193Provider;
  recipient: Address;
  docHash: Hex;
  notary: Address;
  signerAddr: Address;
  ipfsCid: Hex;
  docType: Hex;
  stateCode: Hex;
  timestamp: bigint;
  txHash: Hex;
}): Promise<Hex> {
  const config = getEasConfig();

  const encoder = new SchemaEncoder(NOTARIAL_ACT_SCHEMA);
  const data = encoder.encodeData([
    { name: 'docHash', type: 'bytes32', value: params.docHash },
    { name: 'notary', type: 'address', value: params.notary },
    { name: 'signer', type: 'address', value: params.signerAddr },
    { name: 'ipfsCid', type: 'bytes32', value: params.ipfsCid },
    { name: 'docType', type: 'bytes32', value: params.docType },
    { name: 'stateCode', type: 'bytes32', value: params.stateCode },
    { name: 'timestamp', type: 'uint256', value: params.timestamp },
    { name: 'txHash', type: 'bytes32', value: params.txHash },
  ]);

  const eas = new EAS(config.easAddress);
  eas.connect(toTransactionSigner(params.signer));

  const tx = await eas.attest({
    schema: config.schemaUidAct,
    data: { recipient: params.recipient, data, revocable: false },
  });
  return (await tx.wait()) as Hex;
}

/**
 * Fetches an attestation by UID.
 *
 * @param params - EIP-1193 provider and the attestation UID.
 * @returns The attestation record, or `null` when no attestation exists for
 * the UID. SDK/RPC errors propagate unwrapped.
 */
export async function getAttestation(params: {
  provider: Eip1193Provider;
  uid: Hex;
}): Promise<AttestationRecord | null> {
  const config = getEasConfig();

  const eas = new EAS(config.easAddress);
  eas.connect(toTransactionSigner(params.provider));

  let attestation: Attestation;
  try {
    attestation = await eas.getAttestation(params.uid);
  } catch (err) {
    if (isNotFoundError(err)) {
      return null;
    }
    throw err;
  }

  if (!attestation || !attestation.uid || attestation.uid === zeroHash) {
    return null;
  }
  return toAttestationRecord(attestation);
}

/**
 * Revokes a NotaryCommission attestation and returns the revocation
 * transaction hash.
 *
 * Only the NotaryCommission schema is revocable; NotarialAct attestations are
 * non-revocable by design.
 *
 * @param params - EIP-1193 signer and the commission attestation UID.
 * @returns The revocation transaction hash.
 * @throws `Error` when the EAS schema UIDs are not configured, or any SDK/RPC
 * error unwrapped.
 */
export async function revokeNotarialActAttestation(params: {
  signer: Eip1193Provider;
  uid: Hex;
}): Promise<Hex> {
  const config = getEasConfig();

  const eas = new EAS(config.easAddress);
  eas.connect(toTransactionSigner(params.signer));

  const tx = await eas.revoke({
    schema: config.schemaUidNotary,
    data: { uid: params.uid, value: 0n },
  });

  const waitResult: unknown = await tx.wait();
  const hash = pickTxHash(waitResult, tx.receipt, tx.data);
  if (!hash) {
    throw new Error('Revocation transaction hash is unavailable');
  }
  return hash;
}

/**
 * Extracts a transaction hash from the shapes the SDK (and its test doubles)
 * expose after a revocation: the wait result, the mined receipt, or the
 * broadcast transaction.
 */
function pickTxHash(...values: unknown[]): Hex | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.startsWith('0x')) {
      return value as Hex;
    }
    if (value && typeof value === 'object') {
      const record = value as { hash?: unknown; transactionHash?: unknown };
      const candidate = record.hash ?? record.transactionHash;
      if (typeof candidate === 'string' && candidate.startsWith('0x')) {
        return candidate as Hex;
      }
    }
  }
  return undefined;
}
