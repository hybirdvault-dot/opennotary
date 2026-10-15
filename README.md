# 🏛️ OpenNotary — The Stripe of Notarization

> Notarize.com charges $25 per document. We charge **$1**. Same legal act — notary and signer both sign on-chain via EIP-712, attested via EAS, anchored on Ethereum + Bitcoin, settled in USDC on Base.

**Status:** 🚧 Phase 1 build in progress
**Event:** BLI Legal Tech Hackathon 2 — DoraHacks — deadline Nov 1, 2026

## What it does

- **$1 notarization** — 99¢ to the notary, 1¢ protocol fee, settled in USDC
- **Two signatures, one act** — notary + signer both sign via EIP-712 (replay-protected nonces)
- **Hash-only on-chain** — document content lives on IPFS, only the hash touches the chain
- **Triple proof** — Ethereum (Base) + EAS attestation + Bitcoin timestamp (OpenTimestamps)
- **Public verify page** — anyone can paste a document hash and see the chain of custody

## Repo structure

```
opennotary/
├── contracts/    # NotaryRegistry.sol — Foundry (Solidity 0.8.24, OpenZeppelin 5.x)
├── src/          # Next.js 15 + RainbowKit + wagmi + viem app
└── docs/         # Regulatory memo, demo script, architecture
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Solidity 0.8.24 · OpenZeppelin 5.x · Foundry · Base Sepolia |
| Attestations | Ethereum Attestation Service (EAS) |
| Storage | IPFS via Web3.Storage |
| Anchoring | OpenTimestamps (Bitcoin) |
| App | Next.js 15 · React 19 · RainbowKit · wagmi · viem · shadcn/ui |
| Settlement | USDC on Base |

---

Full README — architecture diagram, bounty mapping, screenshots, and demo video — lands at submission.
