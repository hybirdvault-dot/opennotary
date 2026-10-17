/**
 * Typed access to the deployed `NotaryRegistry` contract.
 *
 * All reads go through an injected viem {@link PublicClient} and all writes
 * through an injected {@link WalletClient}, so callers own provider lifecycle.
 * SDK/RPC errors propagate to the caller unwrapped.
 *
 * Source pattern: wevm/wagmi examples (readContract/writeContract usage).
 */
import {
  isAddress,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import notaryRegistryJson from './abi/notaryRegistry.json';

/**
 * The real `NotaryRegistry` ABI, extracted verbatim from the forge build
 * artifact at `contracts/out/NotaryRegistry.sol/NotaryRegistry.json`.
 */
export const notaryRegistryAbi = notaryRegistryJson;

/**
 * A single recorded notarial act, mirroring the `NotarialAct` contract struct.
 */
export type NotarialAct = {
  /** Content hash of the notarized document. */
  docHash: Hex;
  /** Address of the commissioned notary who performed the act. */
  notary: Address;
  /** Address of the party who acknowledged the document. */
  signer: Address;
  /** `bytes32`-packed IPFS content identifier for the off-chain document. */
  ipfsCid: Hex;
  /** `bytes32`-packed document type descriptor. */
  docType: Hex;
  /** `bytes32`-packed state/jurisdiction code. */
  stateCode: Hex;
  /** Unix timestamp attested to by both parties. */
  timestamp: bigint;
  /** Whether the act has been revoked by an admin. */
  revoked: boolean;
};

/**
 * A notary's registry entry, mirroring the `Notary` contract struct.
 */
export type NotaryRecord = {
  /** Hash referencing the notary's commissioning credentials. */
  commissionHash: Hex;
  /** `bytes32`-packed state/jurisdiction code of the commission. */
  stateCode: Hex;
  /** Unix timestamp after which the notary is no longer active. */
  commissionExpiry: bigint;
  /** Whether the notary is currently in good standing. */
  active: boolean;
};

/**
 * Resolves the deployed `NotaryRegistry` address from
 * `NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS`.
 *
 * @throws `Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set')` when the
 * variable is missing or not a valid address.
 */
export function getNotaryRegistryAddress(): Address {
  const raw = process.env.NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS;
  if (!raw || !isAddress(raw)) {
    throw new Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set');
  }
  return raw;
}

/**
 * Returns the notarial act recorded for `docHash`.
 *
 * @param client - Public client used for the `getAct` read.
 * @param docHash - Content hash identifying the act.
 * @throws The contract's `ActNotFound()` revert (or any RPC error) when no act
 * exists; errors propagate unwrapped.
 */
export async function getAct(client: PublicClient, docHash: Hex): Promise<NotarialAct> {
  return (await client.readContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'getAct',
    args: [docHash],
  })) as NotarialAct;
}

/**
 * Returns every document hash recorded by `notary`, in insertion order.
 *
 * @param client - Public client used for the `getActsByNotary` read.
 * @param notary - Address of the notary.
 */
export async function getActsByNotary(client: PublicClient, notary: Address): Promise<Hex[]> {
  return (await client.readContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'getActsByNotary',
    args: [notary],
  })) as Hex[];
}

/**
 * Returns whether `notary` is currently active and commissioned.
 *
 * @param client - Public client used for the `isNotaryActive` read.
 * @param notary - Address of the notary.
 */
export async function isNotaryActive(client: PublicClient, notary: Address): Promise<boolean> {
  return (await client.readContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'isNotaryActive',
    args: [notary],
  })) as boolean;
}

/**
 * Returns the registry entry for `notary`. Never-registered notaries yield the
 * zero-valued record.
 *
 * @param client - Public client used for the `getNotary` read.
 * @param notary - Address of the notary.
 */
export async function getNotary(client: PublicClient, notary: Address): Promise<NotaryRecord> {
  return (await client.readContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'getNotary',
    args: [notary],
  })) as NotaryRecord;
}

/**
 * Submits a `registerNotary` transaction and returns its hash.
 *
 * @param walletClient - Signing client; its `account` sends the transaction.
 * @param args - Commission record to register.
 * @throws The contract's custom errors (e.g. `NotaryAlreadyRegistered`,
 * `InvalidExpiry`) on revert; errors propagate unwrapped.
 */
export async function writeRegisterNotary(
  walletClient: WalletClient,
  args: {
    notary: Address;
    commissionHash: Hex;
    stateCode: Hex;
    commissionExpiry: bigint;
  },
): Promise<Hex> {
  return walletClient.writeContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'registerNotary',
    args: [args.notary, args.commissionHash, args.stateCode, args.commissionExpiry],
    // viem falls back to `client.account` when the account is unset at runtime.
    chain: walletClient.chain,
    account: walletClient.account as Account,
  });
}

/**
 * Submits a `notarize` transaction and returns its hash.
 *
 * @param walletClient - Signing client; its `account` sends the transaction.
 * @param args - Act data plus both parties' EIP-712 signatures.
 * @throws The contract's custom errors (e.g. `ActAlreadyRecorded`,
 * `InvalidNotarySignature`) on revert; errors propagate unwrapped.
 */
export async function writeNotarize(
  walletClient: WalletClient,
  args: {
    docHash: Hex;
    notary: Address;
    signer: Address;
    ipfsCid: Hex;
    docType: Hex;
    stateCode: Hex;
    timestamp: bigint;
    notarySig: Hex;
    signerSig: Hex;
  },
): Promise<Hex> {
  return walletClient.writeContract({
    address: getNotaryRegistryAddress(),
    abi: notaryRegistryAbi,
    functionName: 'notarize',
    args: [
      args.docHash,
      args.notary,
      args.signer,
      args.ipfsCid,
      args.docType,
      args.stateCode,
      args.timestamp,
      args.notarySig,
      args.signerSig,
    ],
    // viem falls back to `client.account` when the account is unset at runtime.
    chain: walletClient.chain,
    account: walletClient.account as Account,
  });
}
