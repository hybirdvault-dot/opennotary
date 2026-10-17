import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Address, EIP1193Provider, Hex } from 'viem';

/**
 * Acceptance tests for src/lib/attest.ts (spec section 3).
 *
 * The EAS SDK is mocked at the package boundary with faithful shapes:
 * `EAS#attest` resolves a Transaction<string> whose `wait()` yields the
 * attestation UID, `EAS#revoke` resolves a Transaction<void>, and
 * `EAS#getAttestation` resolves the SDK Attestation struct (the on-chain
 * contract returns a zeroed struct — never a revert — for unknown UIDs).
 */

const h = vi.hoisted(() => ({
  easCtorArgs: [] as unknown[][],
  schemaCtorArgs: [] as unknown[][],
  connect: vi.fn(),
  attest: vi.fn(),
  getAttestation: vi.fn(),
  revoke: vi.fn(),
  encodeData: vi.fn(),
}));

vi.mock('@ethereum-attestation-service/eas-sdk', () => {
  class EAS {
    constructor(...args: unknown[]) {
      h.easCtorArgs.push(args);
    }

    connect(...args: unknown[]): this {
      h.connect(...args);
      return this;
    }

    attest(...args: unknown[]): unknown {
      return h.attest(...args);
    }

    getAttestation(...args: unknown[]): unknown {
      return h.getAttestation(...args);
    }

    revoke(...args: unknown[]): unknown {
      return h.revoke(...args);
    }
  }

  class SchemaEncoder {
    constructor(schema: string) {
      h.schemaCtorArgs.push([schema]);
    }

    encodeData(params: unknown[]): string {
      return h.encodeData(params);
    }
  }

  return { EAS, SchemaEncoder };
});

const EAS_ADDRESS_DEFAULT = '0x4200000000000000000000000000000000000021' as Address;
const EAS_ADDRESS_CUSTOM = '0x4200000000000000000000000000000000000099' as Address;
const SCHEMA_UID_ACT = ('0x' + 'aa'.repeat(32)) as Hex;
const SCHEMA_UID_NOTARY = ('0x' + 'bb'.repeat(32)) as Hex;
const ATTESTATION_UID = ('0x' + 'cc'.repeat(32)) as Hex;
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const NOTARY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
const SIGNER_ADDR = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as Address;
const DOC_HASH = ('0x' + 'ab'.repeat(32)) as Hex;
const IPFS_CID = ('0x' + '22'.repeat(32)) as Hex;
const DOC_TYPE = ('0x' + '33'.repeat(32)) as Hex;
const STATE_CODE = ('0x' + '44'.repeat(32)) as Hex;
const TX_HASH = ('0x' + '77'.repeat(32)) as Hex;
const TIMESTAMP = 1_700_000_000n;
const ENCODED_DATA = '0xdeadbeefencoded';

const ACT_SCHEMA_STRING =
  'bytes32 docHash, address notary, address signer, bytes32 ipfsCid, bytes32 docType, ' +
  'bytes32 stateCode, uint256 timestamp, bytes32 txHash';

const ISSUE_PARAMS = {
  recipient: RECIPIENT,
  docHash: DOC_HASH,
  notary: NOTARY,
  signerAddr: SIGNER_ADDR,
  ipfsCid: IPFS_CID,
  docType: DOC_TYPE,
  stateCode: STATE_CODE,
  timestamp: TIMESTAMP,
  txHash: TX_HASH,
};

const PINNED_ENCODE_ORDER = [
  DOC_HASH,
  NOTARY,
  SIGNER_ADDR,
  IPFS_CID,
  DOC_TYPE,
  STATE_CODE,
  TIMESTAMP,
  TX_HASH,
];

function makeProvider(): EIP1193Provider {
  return { request: vi.fn() } as unknown as EIP1193Provider;
}

/**
 * The EAS SDK's signer slot takes an ethers-style TransactionSigner /
 * TransactionProvider, so a conforming wrapper either passes the provider
 * through or adapts it. Accept either wiring.
 */
function expectProviderWiredAsSigner(ctorArgs: unknown[], provider: unknown): void {
  const wired = ((ctorArgs[1] as { signer?: unknown } | undefined)?.signer ??
    h.connect.mock.calls[0]?.[0]) as
    | { call?: unknown; estimateGas?: unknown; resolveName?: unknown }
    | undefined;
  const isProvider = wired === provider;
  const isSignerAdapter =
    typeof wired?.call === 'function' &&
    typeof wired?.estimateGas === 'function' &&
    typeof wired?.resolveName === 'function';
  expect(isProvider || isSignerAdapter).toBe(true);
}

function sdkAttestation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uid: ATTESTATION_UID,
    schema: SCHEMA_UID_ACT,
    refUID: ('0x' + '00'.repeat(32)) as Hex,
    time: TIMESTAMP,
    expirationTime: 0n,
    revocationTime: 0n,
    recipient: RECIPIENT,
    revocable: false,
    attester: NOTARY,
    data: ENCODED_DATA,
    ...overrides,
  };
}

/** The EAS contract returns a fully zeroed struct for unknown attestation UIDs. */
function zeroedSdkAttestation(): Record<string, unknown> {
  return sdkAttestation({
    uid: ('0x' + '00'.repeat(32)) as Hex,
    schema: ('0x' + '00'.repeat(32)) as Hex,
    time: 0n,
    recipient: '0x0000000000000000000000000000000000000000',
    attester: '0x0000000000000000000000000000000000000000',
    data: '0x',
  });
}

function sdkAttestTransaction(uid: Hex): Record<string, unknown> {
  return {
    uid,
    hash: TX_HASH,
    data: { hash: TX_HASH },
    wait: async () => uid,
  };
}

function sdkRevokeTransaction(): Record<string, unknown> {
  return {
    hash: TX_HASH,
    data: { hash: TX_HASH },
    wait: async () => undefined,
  };
}

/** SchemaItem[] or raw values -> the raw values in call order. */
function encodeValues(params: unknown[]): unknown[] {
  return params.map((item) =>
    item !== null && typeof item === 'object' && 'value' in item
      ? (item as { value: unknown }).value
      : item,
  );
}

function setEnv(env: {
  easContract?: string | null;
  schemaUidAct?: string | null;
  schemaUidNotary?: string | null;
}): void {
  const stub = (name: string, value: string | null | undefined): void => {
    if (value === null || value === undefined) {
      vi.stubEnv(name, '');
      delete process.env[name];
    } else {
      vi.stubEnv(name, value);
    }
  };
  stub('NEXT_PUBLIC_EAS_CONTRACT', env.easContract);
  stub('NEXT_PUBLIC_EAS_SCHEMA_UID_ACT', env.schemaUidAct);
  stub('NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY', env.schemaUidNotary);
}

async function importAttest(): Promise<typeof import('@/lib/attest')> {
  vi.resetModules();
  return await import('@/lib/attest');
}

function configuredEnv(): {
  easContract?: string | null;
  schemaUidAct?: string | null;
  schemaUidNotary?: string | null;
} {
  return {
    easContract: EAS_ADDRESS_CUSTOM,
    schemaUidAct: SCHEMA_UID_ACT,
    schemaUidNotary: SCHEMA_UID_NOTARY,
  };
}

beforeEach(() => {
  h.easCtorArgs.length = 0;
  h.schemaCtorArgs.length = 0;
  h.connect.mockReset();
  h.attest.mockReset();
  h.getAttestation.mockReset();
  h.revoke.mockReset();
  h.encodeData.mockReset().mockReturnValue(ENCODED_DATA);
  setEnv(configuredEnv());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/attest', () => {
  describe('getEasConfig', () => {
    test('test_getEasConfig_returnsContractAddressAndBothSchemaUids', async () => {
      const { getEasConfig } = await importAttest();

      expect(getEasConfig()).toEqual({
        easAddress: EAS_ADDRESS_CUSTOM,
        schemaUidAct: SCHEMA_UID_ACT,
        schemaUidNotary: SCHEMA_UID_NOTARY,
      });
    });

    test('test_getEasConfig_defaultsEasAddressToOptimismDeployment', async () => {
      setEnv({ easContract: null, schemaUidAct: SCHEMA_UID_ACT, schemaUidNotary: SCHEMA_UID_NOTARY });
      const { getEasConfig } = await importAttest();

      expect(getEasConfig().easAddress).toBe(EAS_ADDRESS_DEFAULT);
    });

    test('test_getEasConfig_throwsWhenActSchemaUidIsMissing', async () => {
      setEnv({ easContract: EAS_ADDRESS_CUSTOM, schemaUidAct: null, schemaUidNotary: SCHEMA_UID_NOTARY });
      const { getEasConfig } = await importAttest();

      expect(() => getEasConfig()).toThrow(/NEXT_PUBLIC_EAS_SCHEMA_UID_ACT/);
    });

    test('test_getEasConfig_throwsWhenNotarySchemaUidIsMissing', async () => {
      setEnv({ easContract: EAS_ADDRESS_CUSTOM, schemaUidAct: SCHEMA_UID_ACT, schemaUidNotary: null });
      const { getEasConfig } = await importAttest();

      expect(() => getEasConfig()).toThrow(/NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY/);
    });
  });

  describe('issueNotarialActAttestation', () => {
    test('test_issueNotarialActAttestation_encodesPinnedFieldOrderAndReturnsAttestationUid', async () => {
      h.attest.mockResolvedValue(sdkAttestTransaction(ATTESTATION_UID));
      const { issueNotarialActAttestation } = await importAttest();
      const signer = makeProvider();

      const uid = await issueNotarialActAttestation({ signer, ...ISSUE_PARAMS });

      expect(uid).toBe(ATTESTATION_UID);
      expect(h.schemaCtorArgs).toHaveLength(1);
      expect(String(h.schemaCtorArgs[0][0]).replace(/\s+/g, '')).toBe(
        ACT_SCHEMA_STRING.replace(/\s+/g, ''),
      );
      expect(encodeValues(h.encodeData.mock.calls[0][0])).toEqual(PINNED_ENCODE_ORDER);
      expect(h.attest).toHaveBeenCalledTimes(1);
      const request = h.attest.mock.calls[0][0] as {
        schema: string;
        data: { recipient: string; data: string; revocable: boolean };
      };
      expect(request.schema).toBe(SCHEMA_UID_ACT);
      expect(request.data.recipient).toBe(RECIPIENT);
      expect(request.data.data).toBe(ENCODED_DATA);
      expect(request.data.revocable).toBe(false);
      const ctorArgs = h.easCtorArgs[0];
      expect(ctorArgs[0]).toBe(EAS_ADDRESS_CUSTOM);
      expectProviderWiredAsSigner(ctorArgs, signer);
    });

    test('test_issueNotarialActAttestation_propagatesEasSdkFailure', async () => {
      const failure = new Error('attestation submission failed');
      h.attest.mockRejectedValue(failure);
      const { issueNotarialActAttestation } = await importAttest();

      await expect(
        issueNotarialActAttestation({ signer: makeProvider(), ...ISSUE_PARAMS }),
      ).rejects.toBe(failure);
    });
  });

  describe('getAttestation', () => {
    test('test_getAttestation_mapsSdkAttestationToRecord', async () => {
      h.getAttestation.mockResolvedValue(sdkAttestation());
      const { getAttestation } = await importAttest();
      const provider = makeProvider();

      const record = (await getAttestation({ provider, uid: ATTESTATION_UID })) as Record<
        string,
        unknown
      >;

      expect(h.getAttestation).toHaveBeenCalledWith(ATTESTATION_UID);
      expect(record.uid).toBe(ATTESTATION_UID);
      expect(record.schema).toBe(SCHEMA_UID_ACT);
      expect(record.attester).toBe(NOTARY);
      expect(record.recipient).toBe(RECIPIENT);
      expect(record.time).toBe(TIMESTAMP);
      expect(record.data).toBe(ENCODED_DATA);
      expect(record.revoked).toBe(false);
      const ctorArgs = h.easCtorArgs[0];
      expect(ctorArgs[0]).toBe(EAS_ADDRESS_CUSTOM);
      expectProviderWiredAsSigner(ctorArgs, provider);
    });

    test('test_getAttestation_marksRecordRevokedWhenRevocationTimeIsSet', async () => {
      h.getAttestation.mockResolvedValue(sdkAttestation({ revocationTime: 123n }));
      const { getAttestation } = await importAttest();

      const record = (await getAttestation({
        provider: makeProvider(),
        uid: ATTESTATION_UID,
      })) as Record<string, unknown>;

      expect(record.revoked).toBe(true);
    });

    test('test_getAttestation_returnsNullWhenAttestationDoesNotExist', async () => {
      h.getAttestation.mockResolvedValue(zeroedSdkAttestation());
      const { getAttestation } = await importAttest();

      const record = await getAttestation({ provider: makeProvider(), uid: ATTESTATION_UID });

      expect(record).toBeNull();
    });

    test('test_getAttestation_propagatesEasSdkFailure', async () => {
      const failure = new Error('rpc timeout');
      h.getAttestation.mockRejectedValue(failure);
      const { getAttestation } = await importAttest();

      await expect(
        getAttestation({ provider: makeProvider(), uid: ATTESTATION_UID }),
      ).rejects.toBe(failure);
    });
  });

  describe('revokeNotarialActAttestation', () => {
    test('test_revokeNotarialActAttestation_revokesViaNotaryCommissionSchemaAndReturnsTxHash', async () => {
      h.revoke.mockResolvedValue(sdkRevokeTransaction());
      const { revokeNotarialActAttestation } = await importAttest();
      const signer = makeProvider();

      const hash = await revokeNotarialActAttestation({ signer, uid: ATTESTATION_UID });

      expect(hash).toBe(TX_HASH);
      expect(h.revoke).toHaveBeenCalledTimes(1);
      const request = h.revoke.mock.calls[0][0] as { schema: string; data: unknown };
      expect(request.schema).toBe(SCHEMA_UID_NOTARY);
      const payload = Array.isArray(request.data)
        ? (request.data[0] as { uid: unknown })
        : (request.data as { uid: unknown });
      expect(payload.uid).toBe(ATTESTATION_UID);
    });

    test('test_revokeNotarialActAttestation_propagatesEasSdkFailure', async () => {
      const failure = new Error('revocation failed');
      h.revoke.mockRejectedValue(failure);
      const { revokeNotarialActAttestation } = await importAttest();

      await expect(
        revokeNotarialActAttestation({ signer: makeProvider(), uid: ATTESTATION_UID }),
      ).rejects.toBe(failure);
    });
  });
});
