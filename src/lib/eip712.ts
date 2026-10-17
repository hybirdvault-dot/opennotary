/**
 * EIP-712 typed-data construction, signing and verification for OpenNotary.
 *
 * The type strings and message field orders below byte-match the
 * `NotaryRegistry` contract's `abi.encode` layouts, so signatures produced
 * here verify on-chain.
 *
 * Source pattern: viem `signTypedData` docs.
 */
import { recoverAddress } from 'ethers';
import {
  type Account,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem';

/**
 * EIP-712 type definitions for the notary's attestation message. Field order
 * matches `NOTARY_ATTESTATION_TYPEHASH` in `NotaryRegistry.sol`.
 */
export const NOTARY_ATTESTATION_TYPES = {
  NotaryAttestation: [
    { name: 'docHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'ipfsCid', type: 'bytes32' },
    { name: 'docType', type: 'bytes32' },
    { name: 'stateCode', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/**
 * EIP-712 type definitions for the signer's acknowledgment message. Field
 * order matches `SIGNER_ACKNOWLEDGMENT_TYPEHASH` in `NotaryRegistry.sol`.
 */
export const SIGNER_ACKNOWLEDGMENT_TYPES = {
  SignerAcknowledgment: [
    { name: 'docHash', type: 'bytes32' },
    { name: 'notary', type: 'address' },
    { name: 'ipfsCid', type: 'bytes32' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/**
 * The EIP-712 domain separating OpenNotary signatures per chain and contract.
 */
export type Eip712Domain = {
  name: 'OpenNotary';
  version: '1';
  chainId: number;
  verifyingContract: Address;
};

/**
 * Field values of a notary attestation message.
 */
type NotaryAttestationMessage = {
  docHash: Hex;
  signer: Address;
  ipfsCid: Hex;
  docType: Hex;
  stateCode: Hex;
  timestamp: bigint;
  nonce: bigint;
};

/**
 * Field values of a signer acknowledgment message.
 */
type SignerAcknowledgmentMessage = {
  docHash: Hex;
  notary: Address;
  ipfsCid: Hex;
  timestamp: bigint;
  nonce: bigint;
};

/**
 * Builds the EIP-712 domain matching `EIP712("OpenNotary", "1")` deployed by
 * `NotaryRegistry`.
 *
 * @param chainId - EIP-155 chain id of the target network.
 * @param verifyingContract - Address of the deployed `NotaryRegistry`.
 */
export function buildEip712Domain(chainId: number, verifyingContract: Address): Eip712Domain {
  return { name: 'OpenNotary', version: '1', chainId, verifyingContract };
}

/**
 * Builds the notary attestation message in the contract's `abi.encode` order:
 * `docHash, signer, ipfsCid, docType, stateCode, timestamp, nonce`.
 *
 * @param args - Message field values.
 */
export function buildNotaryAttestationMessage(args: {
  docHash: Hex;
  signer: Address;
  ipfsCid: Hex;
  docType: Hex;
  stateCode: Hex;
  timestamp: bigint;
  nonce: bigint;
}): Record<string, unknown> {
  return {
    docHash: args.docHash,
    signer: args.signer,
    ipfsCid: args.ipfsCid,
    docType: args.docType,
    stateCode: args.stateCode,
    timestamp: args.timestamp,
    nonce: args.nonce,
  };
}

/**
 * Builds the signer acknowledgment message in the contract's `abi.encode`
 * order: `docHash, notary, ipfsCid, timestamp, nonce`.
 *
 * @param args - Message field values.
 */
export function buildSignerAcknowledgmentMessage(args: {
  docHash: Hex;
  notary: Address;
  ipfsCid: Hex;
  timestamp: bigint;
  nonce: bigint;
}): Record<string, unknown> {
  return {
    docHash: args.docHash,
    notary: args.notary,
    ipfsCid: args.ipfsCid,
    timestamp: args.timestamp,
    nonce: args.nonce,
  };
}

/**
 * Signs a notary attestation message with the connected wallet account.
 *
 * @param walletClient - Signing client.
 * @param args - Account to sign with, the domain, and the message produced by
 * {@link buildNotaryAttestationMessage}.
 * @returns The EIP-712 signature as a 65-byte hex string.
 */
export async function signNotaryAttestation(
  walletClient: WalletClient,
  args: { account: Account; domain: Eip712Domain; message: Record<string, unknown> },
): Promise<Hex> {
  return walletClient.signTypedData({
    account: args.account,
    domain: args.domain,
    types: NOTARY_ATTESTATION_TYPES,
    primaryType: 'NotaryAttestation',
    message: args.message as NotaryAttestationMessage,
  });
}

/**
 * Signs a signer acknowledgment message with the connected wallet account.
 *
 * @param walletClient - Signing client.
 * @param args - Account to sign with, the domain, and the message produced by
 * {@link buildSignerAcknowledgmentMessage}.
 * @returns The EIP-712 signature as a 65-byte hex string.
 */
export async function signSignerAcknowledgment(
  walletClient: WalletClient,
  args: { account: Account; domain: Eip712Domain; message: Record<string, unknown> },
): Promise<Hex> {
  return walletClient.signTypedData({
    account: args.account,
    domain: args.domain,
    types: SIGNER_ACKNOWLEDGMENT_TYPES,
    primaryType: 'SignerAcknowledgment',
    message: args.message as SignerAcknowledgmentMessage,
  });
}

/**
 * Recovers the signer of `digest` and compares it to `expected`.
 *
 * Recovery is synchronous (secp256k1 recover + address comparison) so the
 * check can gate flows without awaiting.
 *
 * @param params - Expected signer address, the EIP-712 digest, and the
 * signature to check.
 * @returns `true` only when `signature` is well-formed and recovers to
 * `expected` (case-insensitive); malformed signatures return `false` instead
 * of throwing.
 */
export function verifySignature(params: {
  expected: Address;
  digest: Hex;
  signature: Hex;
}): boolean {
  try {
    const recovered = recoverAddress(params.digest, params.signature);
    return recovered.toLowerCase() === params.expected.toLowerCase();
  } catch {
    return false;
  }
}
