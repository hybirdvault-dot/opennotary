import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';

/**
 * Acceptance tests for src/lib/contract.ts (spec section 2).
 *
 * No package mocks: PublicClient/WalletClient are plain injected objects whose
 * readContract/writeContract functions are test spies. Read results use a hybrid
 * tuple shape (array with named properties) so the tests stay agnostic to whether
 * the wrapper maps viem struct results positionally or by name.
 */

type MockFn = ReturnType<typeof vi.fn>;

const REGISTRY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;
const DOC_HASH = ('0x' + 'ab'.repeat(32)) as Hex;
const DOC_HASH_2 = ('0x' + 'cd'.repeat(32)) as Hex;
const NOTARY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const SIGNER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
const COMMISSION_HASH = ('0x' + '11'.repeat(32)) as Hex;
const IPFS_CID = ('0x' + '22'.repeat(32)) as Hex;
const DOC_TYPE = ('0x' + '33'.repeat(32)) as Hex;
const STATE_CODE = ('0x' + '44'.repeat(32)) as Hex;
const FEE = 1_000_000n;
const TIMESTAMP = 1_700_000_000n;
const DEADLINE = 1_700_003_600n;
const NONCE = 5n;
const COMMISSION_EXPIRY = 1_900_000_000n;
const NOTARY_SIG = ('0x' + '55'.repeat(65)) as Hex;
const SIGNER_SIG = ('0x' + '66'.repeat(65)) as Hex;
const TX_HASH = ('0x' + '77'.repeat(32)) as Hex;

const REGISTER_ARGS = {
  notary: NOTARY,
  commissionHash: COMMISSION_HASH,
  stateCode: STATE_CODE,
  commissionExpiry: COMMISSION_EXPIRY,
};

const NOTARIZE_ARGS = {
  docHash: DOC_HASH,
  notary: NOTARY,
  signer: SIGNER,
  ipfsCid: IPFS_CID,
  docType: DOC_TYPE,
  stateCode: STATE_CODE,
  fee: FEE,
  timestamp: TIMESTAMP,
  deadline: DEADLINE,
  notarySig: NOTARY_SIG,
  signerSig: SIGNER_SIG,
};

/** A viem struct result: indexable positionally and by component name. */
function makeStructRow(fields: Record<string, unknown>): unknown[] & Record<string, unknown> {
  return Object.assign(Object.values(fields), fields);
}

function makeActRow(): unknown[] & Record<string, unknown> {
  return makeStructRow({
    docHash: DOC_HASH,
    notary: NOTARY,
    signer: SIGNER,
    ipfsCid: IPFS_CID,
    docType: DOC_TYPE,
    stateCode: STATE_CODE,
    timestamp: TIMESTAMP,
    revoked: false,
  });
}

function makeNotaryRow(): unknown[] & Record<string, unknown> {
  return makeStructRow({
    commissionHash: COMMISSION_HASH,
    stateCode: STATE_CODE,
    commissionExpiry: COMMISSION_EXPIRY,
    active: true,
  });
}

function makePublicClient(readContract: MockFn): PublicClient {
  return { readContract } as unknown as PublicClient;
}

function makeWalletClient(writeContract: MockFn): WalletClient {
  return { writeContract } as unknown as WalletClient;
}

function setRegistryEnv(value: string | null): void {
  if (value === null) {
    vi.stubEnv('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS', '');
    delete process.env.NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS;
    return;
  }
  vi.stubEnv('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS', value);
}

function rpcFailure(): Error {
  return new Error('rpc unreachable');
}

beforeEach(() => {
  setRegistryEnv(REGISTRY_ADDRESS);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/contract', () => {
  describe('getNotaryRegistryAddress', () => {
    test('test_getNotaryRegistryAddress_returnsConfiguredAddress', async () => {
      const { getNotaryRegistryAddress } = await import('@/lib/contract');
      expect(getNotaryRegistryAddress()).toBe(REGISTRY_ADDRESS);
    });

    test('test_getNotaryRegistryAddress_throwsWhenEnvUnset', async () => {
      const { getNotaryRegistryAddress } = await import('@/lib/contract');
      setRegistryEnv(null);
      expect(() => getNotaryRegistryAddress()).toThrow(
        'NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set',
      );
    });

    test('test_getNotaryRegistryAddress_throwsWhenEnvValueIsInvalid', async () => {
      const { getNotaryRegistryAddress } = await import('@/lib/contract');
      setRegistryEnv('not-an-address');
      expect(() => getNotaryRegistryAddress()).toThrow(
        'NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set',
      );
    });
  });

  describe('read delegation', () => {
    test('test_getAct_readsRegistryAndSurfacesActFields', async () => {
      const readContract = vi.fn().mockResolvedValue(makeActRow());
      const { getAct } = await import('@/lib/contract');

      const act = (await getAct(makePublicClient(readContract), DOC_HASH)) as Record<string, unknown>;

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'getAct',
          args: [DOC_HASH],
        }),
      );
      expect(act.docHash).toBe(DOC_HASH);
      expect(act.notary).toBe(NOTARY);
      expect(act.signer).toBe(SIGNER);
      expect(act.ipfsCid).toBe(IPFS_CID);
      expect(act.docType).toBe(DOC_TYPE);
      expect(act.stateCode).toBe(STATE_CODE);
      expect(act.timestamp).toBe(TIMESTAMP);
      expect(act.revoked).toBe(false);
    });

    test('test_getAct_propagatesRpcFailureUnwrapped', async () => {
      const failure = rpcFailure();
      const readContract = vi.fn().mockRejectedValue(failure);
      const { getAct } = await import('@/lib/contract');

      await expect(getAct(makePublicClient(readContract), DOC_HASH)).rejects.toBe(failure);
    });

    test('test_getActsByNotary_returnsDocHashesFromRegistry', async () => {
      const readContract = vi.fn().mockResolvedValue([DOC_HASH, DOC_HASH_2]);
      const { getActsByNotary } = await import('@/lib/contract');

      const hashes = await getActsByNotary(makePublicClient(readContract), NOTARY);

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'getActsByNotary',
          args: [NOTARY],
        }),
      );
      expect(hashes).toEqual([DOC_HASH, DOC_HASH_2]);
    });

    test('test_getActsByNotary_returnsEmptyListForNotaryWithoutActs', async () => {
      const readContract = vi.fn().mockResolvedValue([]);
      const { getActsByNotary } = await import('@/lib/contract');

      await expect(getActsByNotary(makePublicClient(readContract), NOTARY)).resolves.toEqual([]);
    });

    test('test_getActsByNotary_propagatesRpcFailureUnwrapped', async () => {
      const failure = rpcFailure();
      const readContract = vi.fn().mockRejectedValue(failure);
      const { getActsByNotary } = await import('@/lib/contract');

      await expect(getActsByNotary(makePublicClient(readContract), NOTARY)).rejects.toBe(failure);
    });

    test('test_isNotaryActive_returnsTrueForActiveCommission', async () => {
      const readContract = vi.fn().mockResolvedValue(true);
      const { isNotaryActive } = await import('@/lib/contract');

      await expect(isNotaryActive(makePublicClient(readContract), NOTARY)).resolves.toBe(true);
      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'isNotaryActive',
          args: [NOTARY],
        }),
      );
    });

    test('test_isNotaryActive_returnsFalseForInactiveCommission', async () => {
      const readContract = vi.fn().mockResolvedValue(false);
      const { isNotaryActive } = await import('@/lib/contract');

      await expect(isNotaryActive(makePublicClient(readContract), NOTARY)).resolves.toBe(false);
    });

    test('test_isNotaryActive_propagatesRpcFailureUnwrapped', async () => {
      const failure = rpcFailure();
      const readContract = vi.fn().mockRejectedValue(failure);
      const { isNotaryActive } = await import('@/lib/contract');

      await expect(isNotaryActive(makePublicClient(readContract), NOTARY)).rejects.toBe(failure);
    });

    test('test_getNotary_readsRegistryAndSurfacesCommissionRecordFields', async () => {
      const readContract = vi.fn().mockResolvedValue(makeNotaryRow());
      const { getNotary } = await import('@/lib/contract');

      const record = (await getNotary(makePublicClient(readContract), NOTARY)) as Record<
        string,
        unknown
      >;

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'getNotary',
          args: [NOTARY],
        }),
      );
      expect(record.commissionHash).toBe(COMMISSION_HASH);
      expect(record.stateCode).toBe(STATE_CODE);
      expect(record.commissionExpiry).toBe(COMMISSION_EXPIRY);
      expect(record.active).toBe(true);
    });

    test('test_getNotary_propagatesRpcFailureUnwrapped', async () => {
      const failure = rpcFailure();
      const readContract = vi.fn().mockRejectedValue(failure);
      const { getNotary } = await import('@/lib/contract');

      await expect(getNotary(makePublicClient(readContract), NOTARY)).rejects.toBe(failure);
    });

    test('test_getNonce_readsRegistryNonceForAccount', async () => {
      const readContract = vi.fn().mockResolvedValue(NONCE);
      const { getNonce } = await import('@/lib/contract');

      const nonce = await getNonce(makePublicClient(readContract), NOTARY);

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'nonces',
          args: [NOTARY],
        }),
      );
      expect(nonce).toBe(NONCE);
    });

    test('test_getNonce_returnsZeroForFreshAccount', async () => {
      const readContract = vi.fn().mockResolvedValue(0n);
      const { getNonce } = await import('@/lib/contract');

      await expect(getNonce(makePublicClient(readContract), SIGNER)).resolves.toBe(0n);
    });

    test('test_getNonce_propagatesRpcFailureUnwrapped', async () => {
      const failure = rpcFailure();
      const readContract = vi.fn().mockRejectedValue(failure);
      const { getNonce } = await import('@/lib/contract');

      await expect(getNonce(makePublicClient(readContract), NOTARY)).rejects.toBe(failure);
    });
  });

  describe('write delegation', () => {
    test('test_writeRegisterNotary_submitsRegisterNotaryInPinnedArgOrderAndReturnsTxHash', async () => {
      const writeContract = vi.fn().mockResolvedValue(TX_HASH);
      const { writeRegisterNotary } = await import('@/lib/contract');

      const hash = await writeRegisterNotary(makeWalletClient(writeContract), REGISTER_ARGS);

      expect(writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'registerNotary',
          args: [NOTARY, COMMISSION_HASH, STATE_CODE, COMMISSION_EXPIRY],
        }),
      );
      expect(hash).toBe(TX_HASH);
    });

    test('test_writeRegisterNotary_propagatesWalletRejectionUnwrapped', async () => {
      const failure = rpcFailure();
      const writeContract = vi.fn().mockRejectedValue(failure);
      const { writeRegisterNotary } = await import('@/lib/contract');

      await expect(
        writeRegisterNotary(makeWalletClient(writeContract), REGISTER_ARGS),
      ).rejects.toBe(failure);
    });

    test('test_writeNotarize_submitsNotarizeInPinnedArgOrderAndReturnsTxHash', async () => {
      const writeContract = vi.fn().mockResolvedValue(TX_HASH);
      const { writeNotarize } = await import('@/lib/contract');

      const hash = await writeNotarize(makeWalletClient(writeContract), NOTARIZE_ARGS);

      expect(writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY_ADDRESS,
          functionName: 'notarize',
          args: [
            DOC_HASH,
            NOTARY,
            SIGNER,
            IPFS_CID,
            DOC_TYPE,
            STATE_CODE,
            FEE,
            TIMESTAMP,
            DEADLINE,
            NOTARY_SIG,
            SIGNER_SIG,
          ],
        }),
      );
      expect(hash).toBe(TX_HASH);
    });

    test('test_writeNotarize_propagatesWalletRejectionUnwrapped', async () => {
      const failure = rpcFailure();
      const writeContract = vi.fn().mockRejectedValue(failure);
      const { writeNotarize } = await import('@/lib/contract');

      await expect(writeNotarize(makeWalletClient(writeContract), NOTARIZE_ARGS)).rejects.toBe(
        failure,
      );
    });
  });

  describe('abi export', () => {
    test('test_notaryRegistryAbi_exposesEveryRegistryFunction', async () => {
      const { notaryRegistryAbi } = await import('@/lib/contract');

      expect(Array.isArray(notaryRegistryAbi)).toBe(true);
      const functionNames = (notaryRegistryAbi as { type: string; name?: string }[])
        .filter((item) => item.type === 'function')
        .map((item) => item.name);
      for (const name of [
        'getAct',
        'getActsByNotary',
        'isNotaryActive',
        'getNotary',
        'registerNotary',
        'notarize',
      ]) {
        expect(functionNames).toContain(name);
      }
    });
  });
});
