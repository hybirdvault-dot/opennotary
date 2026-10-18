import { describe, expect, test, vi } from 'vitest';
import {
  concat,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type AbiParameter,
  type Account,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Acceptance tests for src/lib/eip712.ts (schema v2.0).
 *
 * The crown jewels are the byte-parity tests: the typehash strings and struct
 * hashes built from the wrapper's exported types and message builders must match
 * the contract's abi.encode typehash strings field-for-field (including the
 * v2 fee + deadline fields).
 */

const NOTARY_ATTESTATION_TYPE_STRING =
  'NotaryAttestation(bytes32 docHash,address signer,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)';
const SIGNER_ACKNOWLEDGMENT_TYPE_STRING =
  'SignerAcknowledgment(bytes32 docHash,address notary,bytes32 ipfsCid,bytes32 docType,bytes32 stateCode,uint256 fee,uint256 timestamp,uint256 deadline,uint256 nonce)';

const PINNED_NOTARY_ATTESTATION_FIELDS = [
  { name: 'docHash', type: 'bytes32' },
  { name: 'signer', type: 'address' },
  { name: 'ipfsCid', type: 'bytes32' },
  { name: 'docType', type: 'bytes32' },
  { name: 'stateCode', type: 'bytes32' },
  { name: 'fee', type: 'uint256' },
  { name: 'timestamp', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
] as const;

const PINNED_SIGNER_ACKNOWLEDGMENT_FIELDS = [
  { name: 'docHash', type: 'bytes32' },
  { name: 'notary', type: 'address' },
  { name: 'ipfsCid', type: 'bytes32' },
  { name: 'docType', type: 'bytes32' },
  { name: 'stateCode', type: 'bytes32' },
  { name: 'fee', type: 'uint256' },
  { name: 'timestamp', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
] as const;

const CHAIN_ID = 84532;
const VERIFYING_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;
const DOC_HASH = ('0x' + 'ab'.repeat(32)) as Hex;
const SIGNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const NOTARY = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
const IPFS_CID = ('0x' + '22'.repeat(32)) as Hex;
const DOC_TYPE = ('0x' + '33'.repeat(32)) as Hex;
const STATE_CODE = ('0x' + '44'.repeat(32)) as Hex;
const FEE = 1_000_000n;
const TIMESTAMP = 1_700_000_000n;
const DEADLINE = 1_700_003_600n;
const NONCE = 7n;
const SIGNATURE = ('0x' + '55'.repeat(65)) as Hex;

const ATTESTATION_ARGS = {
  docHash: DOC_HASH,
  signer: SIGNER,
  ipfsCid: IPFS_CID,
  docType: DOC_TYPE,
  stateCode: STATE_CODE,
  fee: FEE,
  timestamp: TIMESTAMP,
  deadline: DEADLINE,
  nonce: NONCE,
};

const ACKNOWLEDGMENT_ARGS = {
  docHash: DOC_HASH,
  notary: NOTARY,
  ipfsCid: IPFS_CID,
  docType: DOC_TYPE,
  stateCode: STATE_CODE,
  fee: FEE,
  timestamp: TIMESTAMP,
  deadline: DEADLINE,
  nonce: NONCE,
};

type FieldDef = { name: string; type: string };

function encodeTypeString(primaryType: string, fields: readonly FieldDef[]): string {
  return `${primaryType}(${fields.map((field) => `${field.type} ${field.name}`).join(',')})`;
}

function structHash(
  typeString: string,
  fields: readonly FieldDef[],
  values: readonly unknown[],
): Hex {
  const typeHash = keccak256(toBytes(typeString));
  const encodedValues = encodeAbiParameters(
    fields.map((field) => ({ type: field.type }) as AbiParameter),
    values as unknown[],
  );
  return keccak256(concat([typeHash, encodedValues]));
}

function makeWalletClient(signTypedData: ReturnType<typeof vi.fn>): WalletClient {
  return { signTypedData } as unknown as WalletClient;
}

function makeAccount(address: Address): Account {
  return { address, type: 'local' } as unknown as Account;
}

describe('src/lib/eip712', () => {
  describe('exported types', () => {
    test('test_NOTARY_ATTESTATION_TYPES_matchContractFieldOrderExactly', async () => {
      const { NOTARY_ATTESTATION_TYPES } = await import('@/lib/eip712');

      expect(NOTARY_ATTESTATION_TYPES).toEqual({
        NotaryAttestation: [...PINNED_NOTARY_ATTESTATION_FIELDS],
      });
    });

    test('test_SIGNER_ACKNOWLEDGMENT_TYPES_matchContractFieldOrderExactly', async () => {
      const { SIGNER_ACKNOWLEDGMENT_TYPES } = await import('@/lib/eip712');

      expect(SIGNER_ACKNOWLEDGMENT_TYPES).toEqual({
        SignerAcknowledgment: [...PINNED_SIGNER_ACKNOWLEDGMENT_FIELDS],
      });
    });

    test('test_notaryAttestationTypeString_byteMatchesContractTypehashInput', async () => {
      const { NOTARY_ATTESTATION_TYPES } = await import('@/lib/eip712');

      const derived = encodeTypeString('NotaryAttestation', NOTARY_ATTESTATION_TYPES.NotaryAttestation);

      expect(derived).toBe(NOTARY_ATTESTATION_TYPE_STRING);
      expect(keccak256(toBytes(derived))).toBe(keccak256(toBytes(NOTARY_ATTESTATION_TYPE_STRING)));
    });

    test('test_signerAcknowledgmentTypeString_byteMatchesContractTypehashInput', async () => {
      const { SIGNER_ACKNOWLEDGMENT_TYPES } = await import('@/lib/eip712');

      const derived = encodeTypeString(
        'SignerAcknowledgment',
        SIGNER_ACKNOWLEDGMENT_TYPES.SignerAcknowledgment,
      );

      expect(derived).toBe(SIGNER_ACKNOWLEDGMENT_TYPE_STRING);
      expect(keccak256(toBytes(derived))).toBe(
        keccak256(toBytes(SIGNER_ACKNOWLEDGMENT_TYPE_STRING)),
      );
    });
  });

  describe('domain and message builders', () => {
    test('test_buildEip712Domain_returnsPinnedDomainShape', async () => {
      const { buildEip712Domain } = await import('@/lib/eip712');

      expect(buildEip712Domain(CHAIN_ID, VERIFYING_CONTRACT)).toEqual({
        name: 'OpenNotary',
        version: '1',
        chainId: CHAIN_ID,
        verifyingContract: VERIFYING_CONTRACT,
      });
    });

    test('test_buildNotaryAttestationMessage_carriesEveryPinnedFieldWithValue', async () => {
      const { buildNotaryAttestationMessage } = await import('@/lib/eip712');

      const message = buildNotaryAttestationMessage(ATTESTATION_ARGS);

      expect(Object.keys(message).sort()).toEqual(
        PINNED_NOTARY_ATTESTATION_FIELDS.map((field) => field.name).sort(),
      );
      expect(message.docHash).toBe(DOC_HASH);
      expect(message.signer).toBe(SIGNER);
      expect(message.ipfsCid).toBe(IPFS_CID);
      expect(message.docType).toBe(DOC_TYPE);
      expect(message.stateCode).toBe(STATE_CODE);
      expect(message.fee).toBe(FEE);
      expect(message.timestamp).toBe(TIMESTAMP);
      expect(message.deadline).toBe(DEADLINE);
      expect(message.nonce).toBe(NONCE);
    });

    test('test_buildSignerAcknowledgmentMessage_carriesEveryPinnedFieldWithValue', async () => {
      const { buildSignerAcknowledgmentMessage } = await import('@/lib/eip712');

      const message = buildSignerAcknowledgmentMessage(ACKNOWLEDGMENT_ARGS);

      expect(Object.keys(message).sort()).toEqual(
        PINNED_SIGNER_ACKNOWLEDGMENT_FIELDS.map((field) => field.name).sort(),
      );
      expect(message.docHash).toBe(DOC_HASH);
      expect(message.notary).toBe(NOTARY);
      expect(message.ipfsCid).toBe(IPFS_CID);
      expect(message.docType).toBe(DOC_TYPE);
      expect(message.stateCode).toBe(STATE_CODE);
      expect(message.fee).toBe(FEE);
      expect(message.timestamp).toBe(TIMESTAMP);
      expect(message.deadline).toBe(DEADLINE);
      expect(message.nonce).toBe(NONCE);
    });

    test('test_notaryAttestationStructHash_matchesContractTypehashComputation', async () => {
      const { NOTARY_ATTESTATION_TYPES, buildNotaryAttestationMessage } = await import('@/lib/eip712');

      const message = buildNotaryAttestationMessage(ATTESTATION_ARGS);

      // Contract side: the pinned typehash string with values in abi.encode order.
      const contractStructHash = structHash(
        NOTARY_ATTESTATION_TYPE_STRING,
        PINNED_NOTARY_ATTESTATION_FIELDS,
        [
          ATTESTATION_ARGS.docHash,
          ATTESTATION_ARGS.signer,
          ATTESTATION_ARGS.ipfsCid,
          ATTESTATION_ARGS.docType,
          ATTESTATION_ARGS.stateCode,
          ATTESTATION_ARGS.fee,
          ATTESTATION_ARGS.timestamp,
          ATTESTATION_ARGS.deadline,
          ATTESTATION_ARGS.nonce,
        ],
      );

      // Wrapper side: the exported types and the built message.
      const wrapperFields = NOTARY_ATTESTATION_TYPES.NotaryAttestation;
      const wrapperStructHash = structHash(
        encodeTypeString('NotaryAttestation', wrapperFields),
        wrapperFields,
        wrapperFields.map((field: FieldDef) => message[field.name]),
      );

      expect(wrapperStructHash).toBe(contractStructHash);
    });

    test('test_signerAcknowledgmentStructHash_matchesContractTypehashComputation', async () => {
      const { SIGNER_ACKNOWLEDGMENT_TYPES, buildSignerAcknowledgmentMessage } = await import(
        '@/lib/eip712'
      );

      const message = buildSignerAcknowledgmentMessage(ACKNOWLEDGMENT_ARGS);

      const contractStructHash = structHash(
        SIGNER_ACKNOWLEDGMENT_TYPE_STRING,
        PINNED_SIGNER_ACKNOWLEDGMENT_FIELDS,
        [
          ACKNOWLEDGMENT_ARGS.docHash,
          ACKNOWLEDGMENT_ARGS.notary,
          ACKNOWLEDGMENT_ARGS.ipfsCid,
          ACKNOWLEDGMENT_ARGS.docType,
          ACKNOWLEDGMENT_ARGS.stateCode,
          ACKNOWLEDGMENT_ARGS.fee,
          ACKNOWLEDGMENT_ARGS.timestamp,
          ACKNOWLEDGMENT_ARGS.deadline,
          ACKNOWLEDGMENT_ARGS.nonce,
        ],
      );

      const wrapperFields = SIGNER_ACKNOWLEDGMENT_TYPES.SignerAcknowledgment;
      const wrapperStructHash = structHash(
        encodeTypeString('SignerAcknowledgment', wrapperFields),
        wrapperFields,
        wrapperFields.map((field: FieldDef) => message[field.name]),
      );

      expect(wrapperStructHash).toBe(contractStructHash);
    });
  });

  describe('signing delegation', () => {
    test('test_signNotaryAttestation_delegatesTypedDataSigningAndReturnsSignature', async () => {
      const signTypedData = vi.fn().mockResolvedValue(SIGNATURE);
      const { signNotaryAttestation, NOTARY_ATTESTATION_TYPES, buildEip712Domain, buildNotaryAttestationMessage } =
        await import('@/lib/eip712');
      const account = makeAccount(SIGNER);
      const domain = buildEip712Domain(CHAIN_ID, VERIFYING_CONTRACT);
      const message = buildNotaryAttestationMessage(ATTESTATION_ARGS);

      const signature = await signNotaryAttestation(makeWalletClient(signTypedData), {
        account,
        domain,
        message,
      } as never);

      expect(signature).toBe(SIGNATURE);
      expect(signTypedData).toHaveBeenCalledTimes(1);
      const request = signTypedData.mock.calls[0][0] as Record<string, unknown>;
      expect(request.account).toBe(account);
      expect(request.domain).toEqual(domain);
      expect(request.types).toEqual(NOTARY_ATTESTATION_TYPES);
      expect(request.message).toEqual(message);
    });

    test('test_signSignerAcknowledgment_delegatesTypedDataSigningAndReturnsSignature', async () => {
      const signTypedData = vi.fn().mockResolvedValue(SIGNATURE);
      const {
        signSignerAcknowledgment,
        SIGNER_ACKNOWLEDGMENT_TYPES,
        buildEip712Domain,
        buildSignerAcknowledgmentMessage,
      } = await import('@/lib/eip712');
      const account = makeAccount(NOTARY);
      const domain = buildEip712Domain(CHAIN_ID, VERIFYING_CONTRACT);
      const message = buildSignerAcknowledgmentMessage(ACKNOWLEDGMENT_ARGS);

      const signature = await signSignerAcknowledgment(makeWalletClient(signTypedData), {
        account,
        domain,
        message,
      } as never);

      expect(signature).toBe(SIGNATURE);
      expect(signTypedData).toHaveBeenCalledTimes(1);
      const request = signTypedData.mock.calls[0][0] as Record<string, unknown>;
      expect(request.account).toBe(account);
      expect(request.domain).toEqual(domain);
      expect(request.types).toEqual(SIGNER_ACKNOWLEDGMENT_TYPES);
      expect(request.message).toEqual(message);
    });
  });

  describe('verifySignature', () => {
    test('test_verifySignature_returnsTrueForSignatureFromExpectedAddress', async () => {
      const { verifySignature } = await import('@/lib/eip712');
      const account = privateKeyToAccount(('0x' + '11'.repeat(32)) as Hex);
      const digest = keccak256(toBytes('opennotary document digest'));
      const signature = await account.sign({ hash: digest });

      await expect(verifySignature({ expected: account.address, digest, signature })).resolves.toBe(
        true,
      );
    });

    test('test_verifySignature_returnsFalseForSignatureFromDifferentAddress', async () => {
      const { verifySignature } = await import('@/lib/eip712');
      const signer = privateKeyToAccount(('0x' + '11'.repeat(32)) as Hex);
      const other = privateKeyToAccount(('0x' + '22'.repeat(32)) as Hex);
      const digest = keccak256(toBytes('opennotary document digest'));
      const signature = await signer.sign({ hash: digest });

      await expect(verifySignature({ expected: other.address, digest, signature })).resolves.toBe(
        false,
      );
    });

    test('test_verifySignature_returnsFalseForMalformedSignaturesWithoutThrowing', async () => {
      const { verifySignature } = await import('@/lib/eip712');
      const expected = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
      const digest = keccak256(toBytes('opennotary document digest'));

      for (const signature of ['0xdeadbeef' as Hex, '0x' as Hex, ('0x' + '12'.repeat(65)) as Hex]) {
        // Async recoverAddress: resolves to false, never throws/rejects.
        await expect(verifySignature({ expected, digest, signature })).resolves.toBe(false);
      }
    });
  });
});
