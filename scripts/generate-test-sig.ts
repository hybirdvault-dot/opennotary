/**
 * Batch 6 cross-language parity fixture generator.
 *
 * Builds a schema-v2.0 `NotaryAttestation` EIP-712 digest exactly the way the
 * `NotaryRegistry` contract does (`_hashTypedDataV4(keccak256(abi.encode(...)))`)
 * and signs it with viem's `signTypedData`, then writes
 * `test/fixtures/parity-sig.json` for `contracts/test/Parity.t.sol` to consume
 * via `vm.readFile` + `vm.parseJson`.
 *
 * Deterministic by design: the private key, message fields and default domain
 * are fixed constants, so re-running the generator reproduces the same
 * fixture. `chainId` and `verifyingContract` may be overridden per run.
 *
 * Usage (from the repo root):
 *   npx tsx scripts/generate-test-sig.ts [chainId] [verifyingContract]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  hashTypedData,
  keccak256,
  pad,
  recoverTypedDataAddress,
  stringToHex,
  toBytes,
  type Address,
  type Hex,
} from 'viem';
import { signTypedData } from 'viem/actions';
import { privateKeyToAccount } from 'viem/accounts';

/** Deterministic signing key (same 0xA11CE mnemonic as the forge suites). */
const PRIVATE_KEY = '0x00000000000000000000000000000000000000000000000000000000000a11ce' as Hex;

/** Default EIP-155 chain id (Base Sepolia — the pinned demo chain). */
const DEFAULT_CHAIN_ID = 84532;

/** Default `verifyingContract` (deterministic first-deploy CREATE address). */
const DEFAULT_VERIFYING_CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;

/** Total notarization fee both parties commit to: $1.00 USDC (6 decimals). */
const TOTAL_FEE = 1_000_000;

/** Deterministic attested timestamp (mirrors the forge fixture constant). */
const TIMESTAMP = 1_800_000_000;

/** Signature deadline: one hour after the attested timestamp. */
const DEADLINE = TIMESTAMP + 3600;

/**
 * EIP-712 type for the notary attestation — the `NOTARY_ATTESTATION_TYPEHASH`
 * preimage from `NotaryRegistry.sol` (BATCH 1 SCHEMA SPEC v2.0), verbatim.
 */
const NOTARY_ATTESTATION_TYPES = {
  NotaryAttestation: [
    { name: 'docHash', type: 'bytes32' },
    { name: 'signer', type: 'address' },
    { name: 'ipfsCid', type: 'bytes32' },
    { name: 'docType', type: 'bytes32' },
    { name: 'stateCode', type: 'bytes32' },
    { name: 'fee', type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

/**
 * Walks up from `start` until the opennotary repository root (the directory
 * whose package.json names this project) is found.
 */
function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        name?: string;
      };
      if (pkg.name === 'opennotary') {
        return dir;
      }
    } catch {
      // Not this level — keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('opennotary repo root not found; run this script from inside the repository');
}

/** 32-byte right-padded ASCII code, the contract's `bytes32("CA")` form. */
function packedAscii(code: string): Hex {
  return pad(stringToHex(code), { size: 32, dir: 'right' });
}

async function main(): Promise<void> {
  const chainId = process.argv[2] ? Number.parseInt(process.argv[2], 10) : DEFAULT_CHAIN_ID;
  const verifyingContract = (process.argv[3] ?? DEFAULT_VERIFYING_CONTRACT) as Address;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`invalid chainId: ${process.argv[2]}`);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);

  const domain = {
    name: 'OpenNotary',
    version: '1',
    chainId,
    verifyingContract,
  } as const;

  // Deterministic v2.0 attestation message (field order matches the contract's
  // `abi.encode(NOTARY_ATTESTATION_TYPEHASH, docHash, signer, ipfsCid, docType,
  // stateCode, fee, timestamp, deadline, nonce)`).
  const message = {
    docHash: keccak256(toBytes('opennotary-parity-doc')),
    signer: account.address,
    ipfsCid: keccak256(toBytes('opennotary-parity-cid')),
    docType: keccak256(toBytes('DeedOfSale')),
    stateCode: packedAscii('CA'),
    fee: BigInt(TOTAL_FEE),
    timestamp: BigInt(TIMESTAMP),
    deadline: BigInt(DEADLINE),
    nonce: 0n,
  };

  const digest = hashTypedData({
    domain,
    types: NOTARY_ATTESTATION_TYPES,
    primaryType: 'NotaryAttestation',
    message,
  });

  // Standalone viem action: the account is carried client-style, exactly as the
  // `signTypedData` action contract expects.
  const signature = await signTypedData({ account }, {
    domain,
    types: NOTARY_ATTESTATION_TYPES,
    primaryType: 'NotaryAttestation',
    message,
  });

  // Self-check: the viem signature must recover to the expected signer over the
  // exact digest the fixture carries.
  const recovered = await recoverTypedDataAddress({
    domain,
    types: NOTARY_ATTESTATION_TYPES,
    primaryType: 'NotaryAttestation',
    message,
    signature,
  });
  if (recovered.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`parity self-check failed: recovered ${recovered}, expected ${account.address}`);
  }

  // JSON-safe fixture: `uint256` fields are small enough for exact decimal
  // numbers (parseJsonUint-friendly), everything else is 0x-hex.
  const fixture = {
    digest,
    signature,
    signer: account.address,
    message: {
      docHash: message.docHash,
      signer: message.signer,
      ipfsCid: message.ipfsCid,
      docType: message.docType,
      stateCode: message.stateCode,
      fee: TOTAL_FEE,
      timestamp: TIMESTAMP,
      deadline: DEADLINE,
      nonce: 0,
    },
    domain: {
      name: domain.name,
      version: domain.version,
      chainId,
      verifyingContract,
    },
  };

  const repoRoot = findRepoRoot(process.cwd());
  const fixturesDir = path.join(repoRoot, 'test', 'fixtures');
  mkdirSync(fixturesDir, { recursive: true });
  const outPath = path.join(fixturesDir, 'parity-sig.json');
  writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  console.log(`parity fixture written: ${outPath}`);
  console.log(`  signer:   ${fixture.signer}`);
  console.log(`  digest:   ${fixture.digest}`);
  console.log(`  signature:${fixture.signature}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
