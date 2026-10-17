# PINNED LIB INTERFACE SPEC v1.0 — src/lib/ wrappers

Single source of truth for the 11 wrappers. Worker A implements against this; Worker B writes
vitest acceptance tests against this. Neither sees the other's files. Any name, signature, or
behavior not pinned here is the implementer's choice (documented in the deviations list).

**Import alias:** `@/*` → `src/*` (e.g. `import { getAct } from '@/lib/contract'`).
**Style:** TypeScript strict. No `any` in exported signatures. No TODOs. Errors: let SDK errors
propagate unwrapped unless this spec pins a wrapper error.
**External SDKs are mocked at the package boundary** in tests (`vi.mock('@ethereum-attestation-service/eas-sdk')` etc.).

---

## 1. `src/lib/wallet.ts` — RainbowKit/wagmi config
Exports:
- `projectId: string` — from `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (fallback `''`)
- `chains: readonly [Chain, ...Chain[]]` — `[baseSepolia]` (from `wagmi/chains`)
- `wagmiConfig: CreateConfigReturnType` — `getDefaultConfig({ appName: 'OpenNotary', projectId, chains, ssr: true })`
- `rainbowKitTheme: RainbowKitTheme` — `darkTheme({ accentColor: '#C8A968', borderRadius: 'large' })`

No React components in this file. Source pattern: RainbowKit installation docs.

## 2. `src/lib/contract.ts` — NotaryRegistry typed access
Exports:
- `notaryRegistryAbi: typeof notaryRegistryAbi` — the real ABI, extracted from
  `contracts/out/NotaryRegistry.sol/NotaryRegistry.json` into `src/lib/abi/notaryRegistry.json` and imported.
- `getNotaryRegistryAddress(): Address` — reads `NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS`; throws
  `Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set')` if unset/invalid.
- Types `NotarialAct` = `{ docHash: Hex; notary: Address; signer: Address; ipfsCid: Hex; docType: Hex; stateCode: Hex; timestamp: bigint; revoked: boolean }`
  and `NotaryRecord` = `{ commissionHash: Hex; stateCode: Hex; commissionExpiry: bigint; active: boolean }`.
- Functions (client-injected; errors propagate unwrapped):
  - `getAct(client: PublicClient, docHash: Hex): Promise<NotarialAct>`
  - `getActsByNotary(client: PublicClient, notary: Address): Promise<Hex[]>`
  - `isNotaryActive(client: PublicClient, notary: Address): Promise<boolean>`
  - `getNotary(client: PublicClient, notary: Address): Promise<NotaryRecord>`
  - `writeRegisterNotary(walletClient: WalletClient, args: { notary: Address; commissionHash: Hex; stateCode: Hex; commissionExpiry: bigint }): Promise<Hex>`
  - `writeNotarize(walletClient: WalletClient, args: { docHash: Hex; notary: Address; signer: Address; ipfsCid: Hex; docType: Hex; stateCode: Hex; timestamp: bigint; notarySig: Hex; signerSig: Hex }): Promise<Hex>`
Reads use `client.readContract` (address from `getNotaryRegistryAddress()`); writes use
`walletClient.writeContract` and return the tx hash. Source pattern: wevm/wagmi examples.

## 3. `src/lib/attest.ts` — EAS attestations (backend use)
Exports:
- `getEasConfig(): { easAddress: Address; schemaUidAct: Hex; schemaUidNotary: Hex }` — env
  `NEXT_PUBLIC_EAS_CONTRACT` (default `0x4200000000000000000000000000000000000021`),
  `NEXT_PUBLIC_EAS_SCHEMA_UID_ACT`, `NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY`; throws if UIDs missing.
- Type `AttestationRecord` = `{ uid: Hex; schema: Hex; attester: Address; recipient: Address; time: bigint; revoked: boolean; data: Hex }`
- `issueNotarialActAttestation(params: { signer: Eip1193Provider; recipient: Address; docHash: Hex; notary: Address; signerAddr: Address; ipfsCid: Hex; docType: Hex; stateCode: Hex; timestamp: bigint; txHash: Hex }): Promise<Hex>` —
  encodes schema data in the pinned field order `bytes32 docHash, address notary, address signer, bytes32 ipfsCid, bytes32 docType, bytes32 stateCode, uint256 timestamp, bytes32 txHash`
  and submits one attestation via the EAS SDK; returns the attestation UID.
- `getAttestation(params: { provider: Eip1193Provider; uid: Hex }): Promise<AttestationRecord | null>` — returns `null` when the attestation does not exist.
- `revokeNotarialActAttestation(params: { signer: Eip1193Provider; uid: Hex }): Promise<Hex>` — only for the NotaryCommission schema (revocable); NotarialAct schema is non-revocable by design.
Source pattern: ethereum-attestation-service/eas-is-true. Tests `vi.mock` the eas-sdk package.

## 4. `src/lib/storage.ts` — IPFS via Web3.Storage
Exports:
- `createStorageClient(): StorageClient` — w3up client built from env `WEB3_STORAGE_TOKEN`; throws `Error('WEB3_STORAGE_TOKEN is not set')` if missing.
- `uploadDocument(client: StorageClient, file: Blob): Promise<{ cid: string }>`
- `fetchByCid(client: StorageClient, cid: string): Promise<Blob | null>`
- `cidToBytes32(cid: string): Hex` — `keccak256(toBytes(cid))` (viem) — the exact value stored in the contract's `ipfsCid` field.
Source pattern: web3-storage/w3up examples. Tests `vi.mock` the w3up-client package.

## 5. `src/lib/eip712.ts` — typed-data signing (mirrors contract exactly)
Exports:
- `NOTARY_ATTESTATION_TYPES: { NotaryAttestation: [{name:'docHash',type:'bytes32'}, {name:'signer',type:'address'}, {name:'ipfsCid',type:'bytes32'}, {name:'docType',type:'bytes32'}, {name:'stateCode',type:'bytes32'}, {name:'timestamp',type:'uint256'}, {name:'nonce',type:'uint256'}] }`
- `SIGNER_ACKNOWLEDGMENT_TYPES: { SignerAcknowledgment: [{name:'docHash',type:'bytes32'}, {name:'notary',type:'address'}, {name:'ipfsCid',type:'bytes32'}, {name:'timestamp',type:'uint256'}, {name:'nonce',type:'uint256'}] }`
- `buildEip712Domain(chainId: number, verifyingContract: Address): { name: 'OpenNotary'; version: '1'; chainId; verifyingContract }`
- `buildNotaryAttestationMessage(args: { docHash: Hex; signer: Address; ipfsCid: Hex; docType: Hex; stateCode: Hex; timestamp: bigint; nonce: bigint }): Record<string, unknown>`
- `buildSignerAcknowledgmentMessage(args: { docHash: Hex; notary: Address; ipfsCid: Hex; timestamp: bigint; nonce: bigint }): Record<string, unknown>`
- `signNotaryAttestation(walletClient: WalletClient, args: { account: Account; domain: ReturnType<typeof buildEip712Domain>; message: ... }): Promise<Hex>`
- `signSignerAcknowledgment(walletClient: WalletClient, args: { ... }): Promise<Hex>`
- `verifySignature(params: { expected: Address; digest: Hex; signature: Hex }): boolean` — uses viem `recoverAddress`/`verifyMessage`-style math; returns `false` (does not throw) on malformed signatures.
Message field order must byte-match the contract's `abi.encode` typehash strings. Source pattern: viem signTypedData docs.

## 6. `src/lib/anchor.ts` — Bitcoin anchoring (OpenTimestamps)
Exports:
- `stampHash(params: { digest: Hex }): Promise<{ otsProof: Uint8Array }>` — submits the digest to the
  OpenTimestamps calendar network and returns the pending/finalized proof bytes.
- `verifyAnchor(params: { digest: Hex; otsProof: Uint8Array }): Promise<{ verified: boolean; bitcoinBlockHeight?: number; timestamp?: bigint }>` —
  upgrades + verifies the proof against the Bitcoin chain; `verified: false` (not throw) for pending proofs.
- `submitToCalendars` is internal. Source pattern: opentimestamps/javascript-opentimestamps.
Tests `vi.mock` the javascript-opentimestamps package. Note: this package is LGPL — attribution goes in THIRD_PARTY_NOTICES.md.

## 7. `src/lib/usdc.ts` — USDC (IERC20) settlement helpers
Exports:
- `USDC_ADDRESS_BASE_SEPOLIA: Address` = `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- `NOTARY_FEE = 990_000n; PROTOCOL_FEE = 10_000n; TOTAL_FEE = 1_000_000n` (6 decimals)
- `usdcAbi` (minimal IERC20 ABI: approve, allowance, balanceOf, transferFrom, decimals, symbol)
- `approveUsdc(walletClient: WalletClient, args: { spender: Address; amount: bigint }): Promise<Hex>`
- `allowanceOf(client: PublicClient, args: { owner: Address; spender: Address }): Promise<bigint>`
- `balanceOf(client: PublicClient, owner: Address): Promise<bigint>`
Source pattern: OpenZeppelin IERC20 docs.

## 8. `src/lib/ratelimit.ts` — in-memory limiter (no deps)
Exports:
- `rateLimit(key: string, opts?: { limit?: number; windowMs?: number }): { success: boolean; remaining: number; reset: number }`
Defaults `limit = 10`, `windowMs = 60_000`. Sliding window over an in-module `Map`. `reset` = epoch ms when the window frees. Pure, synchronous.

## 9. `src/lib/schemas.ts` — zod validation
Exports:
- `notaryRegisterSchema` — `{ notary: 0x-address string, commissionHash: bytes32 string, stateCode: 2-4 char string, commissionExpiry: ISO date or unix seconds (coerced to number) }`
- `notarizeSchema` — `{ file: File (non-empty, ≤ 25MB), docType: non-empty string, stateCode: 2-4 char string, signerAddress: 0x-address string }`
- `verifySchema` — `{ docHashOrUid: string matching bytes32 hex or attestation UID hex }`
- `type NotaryRegisterInput`, `type NotarizeInput`, `type VerifyInput` (z.infer). Source: zod docs.

## 10. `src/lib/queries.ts` — TanStack Query hooks
Exports (each wraps the corresponding contract.ts reader; default staleTime 30s):
- `useNotarialAct(docHash: Hex | undefined)` → `useQuery<NotarialAct | null>` — `enabled: !!docHash`; returns `null` when the act does not exist (contract revert `ActNotFound` mapped to null).
- `useNotaryActs(notary: Address | undefined)` → `useQuery<Hex[]>`
- `useNotaryCommission(notary: Address | undefined)` → `useQuery<NotaryRecord | null>`
Hooks call `usePublicClient()` (wagmi) internally and delegate to `contract.ts` functions. Tests use
`renderHook` with a `QueryClientProvider` wrapper (`// @vitest-environment jsdom` at top of the test file).
Source: TanStack Query v5 examples.

## 11. `src/lib/kv.ts` — Vercel KV read-through cache (never source of truth)
Exports:
- `cacheAct(docHash: Hex, act: NotarialAct): Promise<void>` — `SET act:<docHash>` with 24h TTL
- `getCachedAct(docHash: Hex): Promise<NotarialAct | null>`
- `cacheNotaryStats(address: Address, stats: { totalActs: number; earnings: bigint }): Promise<void>`
- `getCachedNotaryStats(address: Address): Promise<{ totalActs: number; earnings: bigint } | null>`
All functions no-op/return `null` gracefully when `KV_REST_API_URL`/`KV_REST_API_TOKEN` are unset
(local dev without KV). Tests `vi.mock` `@vercel/kv`. Source: vercel/storage kv examples.

---

## Test suite requirements (Worker B) — `src/lib/__tests__/<name>.test.ts` one file per wrapper
Every wrapper gets: happy path, error path (SDK/RPC failure propagates or is handled per spec),
edge cases (empty input, malformed data). At minimum these named behaviors:
wallet → config shape/chain pinning · contract → read/write delegation + unset-env throw ·
attest → issue/get/revoke + missing-UID throw · storage → upload/fetch + cidToBytes32 + missing-token throw ·
eip712 → typehash/message byte-parity with the contract constants + sign + verify (incl. malformed sig false) ·
anchor → stamp/verify + pending-proof `verified:false` · usdc → approve/allowance/balance + fee constants ·
ratelimit → limit boundary + window reset + independent keys · schemas → valid/invalid/empty per schema ·
queries → hook returns data / maps ActNotFound to null / disabled without arg · kv → set/get round-trip + env-missing graceful no-op.
