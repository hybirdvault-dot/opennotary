# 🏛️ OpenNotary

> The settlement + attestation rails that RON platforms build on. Notarize.com's $25 is full-service including the notary's labour. Our $1 is the platform fee — the transaction layer for digital notarial acts.

**Status:** ✅ Phases 1-3 complete (contract v2.0, 331 tests). Phase 4 (polish + demo video) in progress. Live on Base Sepolia testnet.
**Event:** BLI Legal Tech Hackathon 2 — DoraHacks — deadline Nov 1, 2026

## What it does

- **$1 platform fee per act** — 99¢ to the notary, 1¢ protocol fee, settled in USDC
- **Two signatures, one act** — notary + signer both sign via EIP-712 (replay-protected nonces)
- **Hash-only on-chain** — document content lives on IPFS, only the hash touches the chain
- **Triple proof** — Ethereum (Base) + EAS attestation + Bitcoin timestamp (OpenTimestamps)
- **Public verify page** — anyone can paste a document hash (or attestation UID) and see the chain of custody

## Vendor-free verification

Verification is vendor-free — anyone can verify a notarial act using only the Ethereum chain, IPFS content addressing, and Bitcoin OpenTimestamps, with no dependency on OpenNotary's infrastructure. The service itself runs on commodity infrastructure (Vercel, Alchemy, Web3.Storage, WalletConnect) — but verification doesn't require trusting any of them.

## How a notarial act is recorded

1. **Hash** — the document is hashed client-side; content is pinned to IPFS (Web3.Storage), only the keccak256 hash goes on-chain.
2. **Sign** — signer and notary each sign EIP-712 typed data (replay-protected nonces) committing to the hash, the counterparties and the timestamp.
3. **Settle** — the `NotaryRegistry` contract verifies both signatures and settles the fee in USDC on Base (99¢ notary + 1¢ protocol).
4. **Attest** — the act is attested on Ethereum Attestation Service (EAS) under the non-revocable NotarialAct schema.
5. **Anchor** — a composite digest is committed to Bitcoin via OpenTimestamps (async, finalizes within ~24h).
6. **Verify** — the public verify page rebuilds the whole chain of custody: IPFS CID → Ethereum tx → EAS attestation UID → Bitcoin anchor.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│        FRONTEND (Next.js 16 + RainbowKit + shadcn/ui)             │
│   Landing · Notarize Wizard · Notary Dashboard · Verify · Legal   │
└─────┬──────────────────────┬──────────────────┬──────────────────┘
      │                      │                  │
      ▼                      ▼                  ▼
  wagmi/viem             Web3.Storage       Alchemy RPC + public
   (wallets)            (IPFS pinning)    fallback (Base Sepolia)
      │                      │                  │
      ▼                      ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│       BACKEND (Next.js API routes + Vercel KV indexing)         │
│  /api/notary/register · /api/notarize · /api/verify/[docHash]   │
│  /api/notary/[address] · /api/webhook/outbound · /api/anchor    │
│  KV is a READ-THROUGH CACHE — the source of truth is on-chain   │
└───┬──────────┬──────────────┬─────────────┬─────────────────────┘
    │          │              │             │
    ▼          ▼              ▼             ▼
┌────────┐ ┌────────┐ ┌────────────┐ ┌──────────────┐ ┌────────────┐
│Alchemy │ │Web3    │ │OpenTS      │ │NotaryRegistry│ │ EAS on Base│
│RPC     │ │Storage │ │(Bitcoin)   │ │.sol (Base)   │ │(attest.)   │
└────────┘ └────────┘ └────────────┘ └──────────────┘ └────────────┘
```

## Repo structure

```
opennotary/
├── contracts/    # NotaryRegistry.sol — Foundry (Solidity 0.8.24, OpenZeppelin 5.7)
├── src/          # Next.js 16 + RainbowKit + wagmi + viem app
└── docs/         # Regulatory memo, demo script, architecture
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Solidity 0.8.24 · OpenZeppelin 5.7 · Foundry · Base Sepolia |
| Attestations | Ethereum Attestation Service (EAS) |
| Storage | IPFS via Web3.Storage |
| Anchoring | OpenTimestamps (Bitcoin) |
| App | Next.js 16 · React 19 · framer-motion 14 · RainbowKit 2.2 · wagmi 2 · viem 2 · shadcn/ui |
| Settlement | USDC on Base |

## Contract addresses

| Contract | Network | Address |
|---|---|---|
| `NotaryRegistry` | Base Sepolia | `0x____________________________` (placeholder — set `NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS` in `.env`) |
| EAS | Base Sepolia | `0x4200000000000000000000000000000000000021` |

## Production Upgrade Path (post-hackathon)

The following are intentionally out-of-scope for the hackathon demo:

- **Admin key:** Single `DEFAULT_ADMIN_ROLE` for `registerNotary` + `revokeAct` + `pause`. Production: OpenZeppelin AccessManager with 3 roles (REGISTRAR, PAUSER, REVOKER) + Safe multisig + 48h timelock.
- **Notary onboarding:** Currently stores a KV-only "pending commission". Production: relayer calls `registerNotary()` on-chain after BLI attestation is verified.
- **Rate limiting:** In-memory per serverless instance (resets on cold start). Production: Vercel KV or Upstash Redis for distributed rate limiting.
- **Signer identity:** Not verified (only the notary is BLI-attested). Production: World ID or Gitcoin Passport for proof-of-personhood.
- **OpenTimestamps proofs:** Persisted in KV; production pins the `.ots` proof to IPFS permanently.

## Attribution

OpenNotary is built on open-source software. Every dependency and its license is listed in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — including `javascript-opentimestamps` (LGPL-3.0), the one non-permissive license in the tree.

---

Screenshots, bounty mapping, and the demo video land at submission.
