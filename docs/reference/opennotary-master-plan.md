# 🏛️ OpenNotary — Master Plan (Day 0 to Submission)

> **One document. Everything we decided. From setup to submission.**
> BLI Legal Tech Hackathon 2 — DoraHacks — Nov 1, 2026 deadline — 18 days

---

## 📋 TABLE OF CONTENTS

1. [Hackathon Context](#1-hackathon-context)
2. [The Product](#2-the-product)
3. [All Decisions Locked In](#3-all-decisions-locked-in)
4. [Full Stack Inventory](#4-full-stack-inventory)
5. [Architecture](#5-architecture)
6. [The 18-Day Plan](#6-the-18-day-plan)
7. [Day 1 Detail (Hour by Hour)](#7-day-1-detail-hour-by-hour)
8. [Day 2-3 Detail (Technical)](#8-day-2-3-detail-technical)
9. [Day 4-17 Detail (Polish + Demo)](#9-day-4-17-detail-polish--demo)
10. [Day 18 (Do Nothing)](#10-day-18-do-nothing)
11. [Risks + Mitigations](#11-risks--mitigations)
12. [Bounty Coverage](#12-bounty-coverage)
13. [Pre-Flight Checklist](#13-pre-flight-checklist)
14. [Submission Checklist](#14-submission-checklist)
15. [Reference Links](#15-reference-links)
16. [File Inventory (What's Already Written)](#16-file-inventory-whats-already-written)

---

## 1. HACKATHON CONTEXT

| Field | Value |
|---|---|
| Hackathon name | BLI Legal Tech Hackathon 2 |
| Platform | DoraHacks (https://dorahacks.io/hackathon/legal-hack-2026) |
| Organizer | Blockchain Legal Institute (BLI) — https://bli.tools |
| Prize pool | $20,000 USD base + $50,000+ in bounty tokens |
| Format | Virtual |
| Submission opens | May 15, 2026 |
| Submission deadline | November 1, 2026, 06:01 UTC |
| Days remaining (as of Oct 15, 2026) | 18 |
| Tags | Blockchain, Crypto, Legal, Finance, Compliance, AI, RWA, RegTech, Bitcoin, Ethereum |
| Current participants | 466 hackers, 1 build (PocketChange), 2 open bounties |
| Tracks | All BUIDLs eligible for all bounties (confirmed via DoraHacks Q&A) |

---

## 2. THE PRODUCT

### Name
**OpenNotary** — "The Stripe of Notarization"

### One-Sentence Pitch
> *Notarize.com charges $25 per document. We charge $1. Same legal act — notary and signer both sign on-chain via EIP-712, attested via EAS, anchored on Ethereum + Bitcoin, settled in USDC. Zero platform lock-in. Sovereign identity.*

### Market

| Metric | Value |
|---|---|
| Current RON market (US) | $400M |
| Projected RON market 2027 | $2B+ |
| US notaries | 4.4M |
| States with RON laws | 42 |
| Notarize acquisition value (2021) | $1.25B (proven exit) |

### Real Users + Real Pain

| User | Current pain | Our solution |
|---|---|---|
| Solo/retail notaries (4.4M) | Notarize takes 50-90% of their fee | Keep 99¢ of every $1 |
| Title agents | $50/closing for RON | $5/closing |
| Estate attorneys | $75/estate in notary fees | $3/estate |
| Banks/lenders | $25 × thousands/mo in loan signings | $1 each |
| Clio/MyCase/Smokeball (SaaS) | Integrate Notarize at $25/stamp + 30% rev share | $1/stamp + 50% rev share — they switch today |

### Why Now
- 42 states passed RON laws since 2020 (NY 2023, CA 2024)
- RON market grew 9x in 2020-2024
- EIP-712 matured in 2023-2024
- EAS launched on Base in 2024
- USDC on Base settled $1B+ in Q1 2026

---

## 3. ALL DECISIONS LOCKED IN

### Strategic Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Idea: OpenNotary** — "Stripe of Notarization" | Real users (4.4M notaries), real market ($400M → $2B), clear monetization ($1/stamp), regulatory hook (42 states) |
| 2 | **Time split: 3 days technical + 14 days polish** | 75% on polish — judges see design in 5 seconds before reading code |
| 3 | **Strategy: "Base + Selective Grafting"** (teacher's recommendation) | One base repo + selective OSS libraries. Don't Frankenstein 5 repos. |
| 4 | **Sovereign stack pivot: 90% sovereign, 10% pragmatic** | Drop Stripe/Supabase/Alchemy/Sentry giants. Use Helia→Web3.Storage, no DB → Vercel KV cache, public RPC → Alchemy (free) |
| 5 | **KYC approach: BLI-issued EAS attestation** | Sovereign identity. No Stripe vendor. BLI = trust authority. Email sent for hackathon judging window. |
| 6 | **Verify page = 100% custom code** | The differentiator. Don't copy. Build fresh with animated SVG timeline + green checkmark stamp. |
| 7 | **Mobile-first design** | Tested on iPhone Safari + Android Chrome. RainbowKit deep-links to mobile wallets. |
| 8 | **2026-level design polish bar** | Reference: Stripe.com + Linear.app + Rainbow.me. Dark mode default. Plus Jakarta Sans + Inter + JetBrains Mono. |
| 9 | **Submission on Day 17, never Day 18** | Always leave 24h buffer for "oh shit" moments |
| 10 | **One BUIDL enters multiple bounty tracks** | DoraHacks allows it (confirmed). One product hits ~7 bounty themes. |

### Technical Decisions (Teacher's Blind Spots Fixed)

| # | Decision | Why |
|---|---|---|
| 11 | Smart contract: OpenZeppelin Wizard base + my `notarize()` logic | Don't fork existing notary repos — unknown audit status, license ambiguity |
| 12 | Hash-only on-chain (documents on IPFS) | Gas cost + privacy |
| 13 | EIP-712 nonce per account | Replay attack protection |
| 14 | ECDSA.recover sig verification (not msg.sender) | Anti-phishing — verify signature, not caller |
| 15 | Pausable + ReentrancyGuard | Emergency stop + reentrancy protection — judges love this |
| 16 | OpenTimestamps handled async (fire-and-forget) | 30-sec anchor doesn't block notarize tx |
| 17 | Vercel KV = read-through cache only | Not source of truth. On-chain + IPFS + EAS = source of truth. |
| 18 | EAS calls backend-only (not from frontend) | Exposes private key + CORS issues |
| 19 | All OSS MIT or Apache 2.0 (LGPL only for OpenTimestamps) | License hygiene per teacher's checklist |
| 20 | `THIRD_PARTY_NOTICES.md` + attribution in README | DoraHacks rule — non-disclosure = DQ |

### Design Decisions

| # | Decision | Specification |
|---|---|---|
| 21 | Color palette | Dark navy #0A0F1A bg / Gold #C8A968 accent / Emerald #10B981 success / Wax red #B8463F errors |
| 22 | Typography | Plus Jakarta Sans (headings) + Inter (body) + JetBrains Mono (hashes) |
| 23 | Spacing | 8-point grid (4, 8, 12, 16, 24, 32, 48, 64, 96) |
| 24 | Radius | Cards rounded-2xl (16px), Buttons rounded-xl (12px), Pills rounded-full |
| 25 | Motion | framer-motion spring physics, never linear. Page transitions + card hover + button press + verify stamp + timeline cascade |
| 26 | Mobile patterns | Bottom navigation (4 tabs), sticky bottom CTAs, bottom-sheet modals, WalletConnect deep links, min 44×44 tap targets |
| 27 | Dark mode default | First load = dark. Light mode toggle in profile. |
| 28 | Logo motif | Notary seal — concentric rings. Used as logo, hero watermark, success stamp, loading state. |

---

## 4. FULL STACK INVENTORY

### Base Repo (1 chosen, 5 rejected)

| Candidate | Status |
|---|---|
| ✅ **`npm create rainbowkit@latest`** (official) | CHOSEN — MIT, v2.2.11, latest Next 15 + React 19 + wagmi 2 + viem 2 |
| Pedrojok01/Next-Web3-Boilerplate | Rejected — Chakra UI conflicts with shadcn |
| defi-wonderland/web3-nextjs-boilerplate | Rejected — too opinionated |
| coredao-org/Core-NextJs-Rainbowkit | Rejected — Core chain focused |
| scaffold-eth-2 | Rejected — uses Hardhat (we want Foundry) |
| mirshko/next-web3-boilerplate | Rejected — ARCHIVED June 2024 |

### Frontend Dependencies (npm packages)

| Package | Version | License | Purpose | Source |
|---|---|---|---|---|
| next | 15.x | MIT | App framework (App Router) | https://nextjs.org |
| react | 19.x | MIT | UI runtime | https://react.dev |
| react-dom | 19.x | MIT | DOM renderer | https://react.dev |
| typescript | 5.x | Apache-2.0 | Type safety | https://www.typescriptlang.org |
| @rainbow-me/rainbowkit | 2.2.11 | MIT | Wallet connection UI | https://rainbowkit.com |
| wagmi | 2.x | MIT | React hooks for Ethereum | https://wagmi.sh |
| viem | 2.x | MIT | TypeScript Ethereum client | https://viem.sh |
| @tanstack/react-query | 5.x | MIT | Async state caching | https://tanstack.com/query |
| shadcn/ui | latest (CLI) | MIT | Copy-paste components | https://ui.shadcn.com |
| tailwindcss | 4.x | MIT | Utility CSS | https://tailwindcss.com |
| lucide-react | latest | ISC | Icons | https://lucide.dev |
| class-variance-authority | latest | Apache-2.0 | Component variants | https://github.com/joe-bell/cva |
| clsx | latest | MIT | Class composition | https://github.com/lukeed/clsx |
| tailwind-merge | latest | MIT | Tailwind class merging | https://github.com/dcastil/tailwind-merge |
| @radix-ui/react-* | latest | MIT | Primitives (via shadcn) | https://www.radix-ui.com |
| framer-motion | 11.x | MIT | Spring physics animations | https://motion.dev |
| react-hook-form | 7.x | MIT | Form state | https://react-hook-form.com |
| zod | 3.x | ISC | Schema validation | https://zod.dev |
| @hookform/resolvers | latest | MIT | RHF + zod bridge | https://github.com/react-hook-form/resolvers |
| sonner | latest | MIT | Toast notifications | https://sonner.emilkowalski.dev |
| date-fns | 4.x | MIT | Date formatting | https://date-fns.org |
| qrcode.react | latest | MIT | QR codes for verify URLs | https://github.com/zngntn/qrcode.react |

### Smart Contract Dependencies

| Package | Version | License | Purpose | Source |
|---|---|---|---|---|
| @openzeppelin/contracts | 5.x | MIT | AccessControl, ReentrancyGuard, EIP712, Pausable, Nonces, IERC20 | https://openzeppelin.com/contracts |
| OpenZeppelin Wizard | (web tool) | MIT | Contract generator | https://wizard.openzeppelin.com |
| forge-std | 1.x | Apache-2.0/MIT | Foundry testing stdlib | https://github.com/foundry-rs/forge-std |
| Foundry | 1.x | Apache-2.0/MIT | Compile + test + deploy | https://getfoundry.io |
| Solidity | 0.8.24 | (GPL compiler, output is yours) | Contract language | https://soliditylang.org |

### Web3 / Blockchain Integrations

| Package | Version | License | Purpose | Source |
|---|---|---|---|---|
| @ethereum-attestation-service/eas-sdk | 2.x | MIT | On-chain attestations | https://github.com/ethereum-attestation-service/eas-sdk |
| @web3-storage/w3up-client | 17.x | Apache-2.0 | IPFS uploads | https://github.com/web3-storage/w3up |
| opentimestamps-client | latest | LGPL | Bitcoin anchor | https://github.com/opentimestamps/opentimestamps-client |

### Pattern References (code READ, not copied — for inspiration)

| Repo | License | What we learned |
|---|---|---|
| ethereum-attestation-service/eas-is-true | MIT | EAS SDK patterns — adapted in `src/lib/attest.ts` |
| OpenZeppelin EIP712Verifier.sol example | MIT | EIP-712 sig verification pattern |
| vercel/examples (nextjs-vercel-og) | MIT | Dynamic OG image for verify pages |
| web3-storage/w3up-client examples | Apache-2.0 | IPFS upload pattern |

### External Services (Free Tiers Only)

| Service | Purpose | Tier | URL |
|---|---|---|---|
| Vercel | Hosting + auto-deploy | Free hobby | https://vercel.com |
| Vercel KV | Redis (read-through cache) | Free 256MB | https://vercel.com/docs/storage/vercel-kv |
| Alchemy | Base Sepolia RPC + mainnet RPC | Free 10M CU/mo | https://www.alchemy.com |
| Web3.Storage | IPFS pinning | Free 100GB | https://web3.storage |
| WalletConnect Cloud | Project ID for wallet protocol | Free | https://cloud.walletconnect.com |
| OpenTimestamps.org | Bitcoin anchor | Free, no key | https://opentimestamps.org |
| Base Sepolia faucet | Testnet ETH | Free 0.5+ ETH | https://www.alchemy.com/faucets/base-sepolia |
| Basescan (Sepolia) | Block explorer + contract verification | Free | https://sepolia.basescan.org |
| Sourcify | Alt contract verification | Free | https://sourcify.dev |
| GitHub | Code hosting | Free public repos | https://github.com |
| GitHub Actions | Optional CI | Free 2000 min/mo | https://github.com/features/actions |
| Supabase | (None — replaced by Vercel KV) | — | — |
| Stripe Identity | (None — replaced by BLI attestation) | — | — |
| Sentry | (None — skip entirely) | — | — |
| Upstash | (None — replaced by in-memory ratelimit) | — | — |
| Namecheap | Custom domain (optional Day 15) | $10/yr | https://www.namecheap.com |

### Pre-Deployed Contracts (Already on Base Sepolia)

| Contract | Address | Source |
|---|---|---|
| EAS on Base Sepolia | `0x4200000000000000000000000000000000000021` | https://attest.org |
| Base Sepolia testnet USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | https://www.circle.com |

### Total Count

| Metric | Count |
|---|---|
| Direct npm packages | 22 |
| Smart contract libraries | 3 |
| External services (free) | 11 |
| Pre-deployed contracts used | 2 |
| Custom code (LOC) | ~800 |
| Total setup time | ~5 hours |

---

## 5. ARCHITECTURE

### System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│       FRONTEND (Next.js 15 + RainbowKit + shadcn/ui)              │
│  Landing · Notarize Wizard · Notary Dashboard · Verify · Legal  │
└─────┬──────────────────────┬──────────────────┬────────────────┘
      │                      │                  │
      ▼                      ▼                  ▼
  wagmi/viem             Web3.Storage       Alchemy RPC + public
   (wallet)             (IPFS pinning)    fallback (Base Sepolia)
      │                      │                  │
      ▼                      ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│       BACKEND (Next.js API routes + Vercel KV indexing)         │
│  /api/notary/register · /api/notarize · /api/verify/[docHash]   │
│  /api/notary/[address] · /api/webhook/outbound · /api/anchor   │
│  KV used as READ-THROUGH CACHE — source of truth is on-chain   │
└───┬──────────┬──────────────┬─────────────┬───────────────────┘
    │          │              │             │
    ▼          ▼              ▼             ▼
┌────────┐ ┌────────┐ ┌───────────┐ ┌────────────┐ ┌─────────────┐
│Alchemy │ │Web3    │ │OpenTS     │ │NotaryRegist│ │ EAS on Base │
│RPC     │ │Storage │ │(Bitcoin)  │ │  ry.sol    │ │(attestations│
│        │ │(IPFS)  │ │           │ │            │ │+ BLI trust) │
└────────┘ └────────┘ └───────────┘ └────────────┘ └─────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │  Vercel KV (Redis)   │
                  │  Demo indexing layer │
                  │  Read-through cache  │
                  └──────────────────────┘
```

### Smart Contract: `NotaryRegistry.sol`

**Architecture (5 security fixes baked in)**

| Fix | Implementation |
|---|---|
| Hash-only on-chain | `notarize()` takes `bytes32 docHash` only — no document content |
| EIP-712 nonces per account | OpenZeppelin `Nonces` module — `nonce` field in NotaryAttestation + SignerAcknowledgment types |
| ECDSA.recover sig verification | Both `notarySig` and `signerSig` verified via `ECDSA.recover(digest, sig)` — never trust msg.sender alone |
| Pausable + ReentrancyGuard | `pause()`/`unpause()` admin only + `nonReentrant` modifier on `notarize()` |
| Async OpenTimestamps | Bitcoin anchor triggered by backend `/api/anchor/btc` AFTER on-chain `notarize()` confirms — doesn't block tx |

**Key Functions**

| Function | Caller | Purpose |
|---|---|---|
| `registerNotary(notary, commissionHash, stateCode, expiry)` | Admin | Onboard notary after BLI attestation |
| `notarize(docHash, signer, ipfsCid, docType, stateCode, timestamp, notarySig, signerSig)` | Notary | Record act + settle USDC fee (99¢ notary + 1¢ protocol) |
| `revokeNotary(notary)` | Admin | Revoke commission |
| `revokeAct(docHash)` | Admin | Mark recorded act as revoked (fraud cases) |
| `pause()` / `unpause()` | Admin | Emergency stop / restart |
| `getAct(docHash)` | Anyone | Public verify endpoint |
| `getActsByNotary(notary)` | Anyone | Dashboard query |
| `isNotaryActive(notary)` | Anyone | Check commission status |

**USDC Settlement Flow**

1. Signer calls `usdc.approve(NotaryRegistry, $1 USDC)` (1 tx)
2. Notary calls `notarize()` with both EIP-712 sigs
3. Contract verifies both sigs via ECDSA.recover
4. Contract calls `usdc.transferFrom(signer, notary, 990_000)` (99¢)
5. Contract calls `usdc.transferFrom(signer, protocolTreasury, 10_000)` (1¢)
6. Contract records act + emits `NotarialActRecorded` event
7. Backend issues EAS attestation referencing the act (off-chain, async)
8. Backend triggers OpenTimestamps anchor on `keccak256(docHash + txHash + attestationUid)` (async)

### EAS Schemas (Registered Once on Base Sepolia)

**Schema 1: NotaryCommission**
```
address notaryWallet, string name, string commissionNumber, 
string stateCode, uint256 commissionExpiry, string stateBarNumber
```
- Revocable: Yes
- Issuer: BLI (the hackathon organizer)
- Purpose: Trust anchor for notary onboarding

**Schema 2: NotarialAct**
```
bytes32 docHash, address notary, address signer, bytes32 ipfsCid, 
bytes32 docType, bytes32 stateCode, uint256 timestamp, bytes32 txHash
```
- Revocable: No (permanent record)
- Issuer: OpenNotary backend (relayer)
- Purpose: Public verifiable attestation of each notarial act

### Frontend Routes (4 mobile-first pages)

| Route | Purpose |
|---|---|
| `/` | Landing — hero, demo video, "Become a notary" + "Notarize a document" + "Verify" CTAs |
| `/notarize` | 3-step wizard: upload → wallet sign → confirm tx + USDC settle |
| `/notary/register` | Notary onboarding — KYC via BLI attestation → on-chain registerNotary() |
| `/notary/dashboard` | Notary stats — commission status, total acts, earnings, recent acts |
| `/verify` | Search box — paste doc hash or attestation UID |
| `/verify/[docHash]` | Public verify page — animated verdict stamp + chain-of-custody timeline |
| `/legal` | Regulatory memo — UETA §7, ESIGN §101, e-IDAS QES, MiCA Art. 60, SEC Rule 17a-4, GDPR Art. 5, UCC Article 12 |
| `/api-docs` | Stripe-style API reference for legaltech SaaS integrations |
| `/pricing` | Simple pricing: $1/stamp + $5/mo notary KYC + custom B2B |

### Backend API (Next.js Route Handlers)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/notary/register` | POST | After BLI attestation → register on-chain |
| `/api/notarize` | POST | Orchestrate: IPFS upload → EIP-712 sigs → on-chain tx → EAS attestation → async OTS |
| `/api/verify/[docHash]` | GET | Public verify endpoint — returns full notarial act |
| `/api/notary/[address]` | GET | Notary dashboard data |
| `/api/webhook/stripe` | POST | (skipped — no Stripe) |
| `/api/webhook/outbound` | POST | Outbound webhook to legaltech SaaS — fires when notarization completes |
| `/api/anchor/btc` | POST | Internal — submit docHash to OpenTimestamps after on-chain anchor |

### `lib/` Wrapper Files

| File | Wraps | Exports |
|---|---|---|
| `lib/wallet.ts` | RainbowKit + wagmi + viem | `wagmiConfig`, `rainbowKitTheme`, `chains` |
| `lib/contract.ts` | NotaryRegistry ABI | `registerNotary()`, `notarize()`, `getAct()`, `isNotaryActive()` typed wrappers |
| `lib/attest.ts` | @ethereum-attestation-service/eas-sdk | `issueNotarizationAttestation()`, `getAttestation(uid)` |
| `lib/storage.ts` | @web3-storage/w3up-client | `uploadDocument(file)`, `fetchByCid(cid)` |
| `lib/eip712.ts` | viem typed-data utils | `signNotaryAttestation()`, `signSignerAcknowledgment()`, `verifySignature()` |
| `lib/anchor.ts` | opentimestamps-client | `anchorOnBitcoin(docHash)`, `verifyBtcAnchor(proof)` |
| `lib/usdc.ts` | IERC20 ABI | `approveUsdc(amount)`, `transferUsdc(to, amount)` |
| `lib/ratelimit.ts` | (in-memory, no dep) | `rateLimit(ip, limit)` — 10 LOC |
| `lib/schemas.ts` | zod | `notaryRegisterSchema`, `notarizeSchema`, `verifySchema` |
| `lib/queries.ts` | @tanstack/react-query | `useNotaryActs(address)`, `useNotarialAct(docHash)`, `useNotaryCommission(address)` |
| `lib/kv.ts` | @vercel/kv | `cacheAct(docHash, act)`, `getCachedAct(docHash)`, `cacheNotaryStats(address, stats)` |

### File Structure

```
opennotary/
├── contracts/
│   ├── src/NotaryRegistry.sol       ✅ WRITTEN (370 LOC)
│   ├── script/DeployNotaryRegistry.s.sol  ✅ WRITTEN
│   ├── test/NotaryRegistry.t.sol    ✅ WRITTEN (9 tests)
│   ├── foundry.toml                  ✅ WRITTEN
│   ├── .env.example                  ✅ WRITTEN
│   ├── .gitignore                    ✅ WRITTEN
│   └── README.md                     ✅ WRITTEN
├── src/                               ⏳ Day 2-3
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Landing
│   │   ├── notarize/page.tsx
│   │   ├── notary/
│   │   │   ├── register/page.tsx
│   │   │   └── dashboard/page.tsx
│   │   ├── verify/
│   │   │   ├── page.tsx
│   │   │   └── [docHash]/page.tsx
│   │   ├── legal/page.tsx
│   │   ├── api-docs/page.tsx
│   │   └── pricing/page.tsx
│   ├── app/api/
│   │   ├── notary/register/route.ts
│   │   ├── notary/[address]/route.ts
│   │   ├── notarize/route.ts
│   │   ├── verify/[docHash]/route.ts
│   │   ├── anchor/btc/route.ts
│   │   └── webhook/outbound/route.ts
│   ├── components/
│   │   ├── ui/                        # shadcn (Day 2)
│   │   ├── wallet-connect-button.tsx
│   │   ├── notary-badge.tsx
│   │   ├── notarize-wizard.tsx
│   │   ├── chain-of-custody-timeline.tsx
│   │   ├── verdict-stamp.tsx
│   │   ├── hash-chip.tsx
│   │   └── bento-card.tsx
│   └── lib/                           # 11 wrappers (Day 2)
├── public/
│   ├── demo-video.mp4                 (Day 15)
│   ├── og-image.png                   (Day 13)
│   └── notary-stamp.svg
├── .env.example                       ✅ WRITTEN (in contracts/)
├── .gitignore                         ⏳ Day 2
├── next.config.ts                     ⏳ Day 2
├── tailwind.config.ts                 ⏳ Day 2
├── package.json                       ⏳ Day 2
├── foundry.toml                       ✅ WRITTEN
├── README.md                          ✅ WRITTEN
└── THIRD_PARTY_NOTICES.md             ✅ WRITTEN
```

---

## 6. THE 18-DAY PLAN

### Phase 1 — Technical Working (Days 1-3, ~14 hours total)

| Day | Hours | Goal | Output |
|---|---|---|---|
| **Day 1** | 4 | Foundation | Contract deployed + verified + EAS schema registered + accounts set up |
| **Day 2** | 5 | Core flows | Notarize wizard ugly working end-to-end + verify page basic |
| **Day 3** | 5 | Complete stack | OpenTimestamps + USDC + dashboard + legal page + Vercel deploy + mobile test |

### Phase 2 — Design + Polish (Days 4-17, ~140 hours)

| Day | Focus | Hours |
|---|---|---|
| 4-6 | Hero + landing polish (framer-motion + shadcn) | 24 |
| 7-9 | Notarize wizard animations + success stamp | 24 |
| 9-10 | Verify "wow moment" — animated chain-of-custody timeline (100% custom — differentiator) | 16 |
| 10-11 | Dashboard bento grid | 16 |
| 11-12 | Mobile + dark mode + all error/empty/loading states | 16 |
| 12-13 | Regulatory memo page typography (Plus Jakarta Sans + Inter + JetBrains Mono) | 12 |
| 13-14 | README + demo script + screenshots | 12 |
| 15 | Demo video production (90 sec) | 8 |
| 16 | Buffer for broken things + iterate video | 8 |
| **17** | **SUBMIT on DoraHacks** | 4 |

### Day 18 — DON'T TOUCH

| Day | Focus |
|---|---|
| 18 | Don't touch. Already submitted. No git push. No "quick fix." Nothing. |

---

## 7. DAY 1 DETAIL (HOUR BY HOUR)

### Block 1 (0:00-0:30) — Accounts + Outreach

| Task | URL | Time | Saves |
|---|---|---|---|
| Get Base Sepolia ETH | https://www.alchemy.com/faucets/base-sepolia | 5 min | `0xYOUR_WALLET` has 0.5+ testnet ETH |
| Alchemy account + Base Sepolia app | https://www.alchemy.com | 10 min | `NEXT_PUBLIC_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...` |
| Web3.Storage account + token | https://web3.storage | 10 min | `WEB3_STORAGE_TOKEN=eyJ...` |
| Vercel account + KV database | https://vercel.com → Storage → KV | 15 min | `KV_REST_API_URL=...` + `KV_REST_API_TOKEN=...` |
| WalletConnect Cloud project | https://cloud.walletconnect.com | 5 min | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...` |
| GitHub repo (public) | https://github.com/new → name: `opennotary` | 5 min | Repo URL |
| Send BLI attestation email | https://dorahacks.io/hackathon/legal-hack-2026/qa | 10 min | (async — BLI reply by Day 2-3) |
| Post in DoraHacks Discord for designer | https://discord.gg/dorahacks #find-a-team | 5 min | (async — designer replies by Day 5) |

### Block 2 (0:30-1:30) — Scaffold + Deploy Contract

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Install dependencies
cd /home/z/my-project/opennotary/contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

# Set up env
cp .env.example .env
# Edit .env: PRIVATE_KEY, BASE_SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, PROTOCOL_TREASURY, ADMIN_ADDRESS

# Run tests
forge test -vvv

# Deploy on Base Sepolia + verify on Basescan
source .env
forge script script/DeployNotaryRegistry.s.sol:DeployNotaryRegistryScript \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

✅ Save the deployed contract address → `NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS=0x...`

### Block 3 (1:30-2:30) — EAS Schema Registration + Test

1. Go to https://base-sepolia.easscan.org/schema/create
2. Register Schema 1 (NotaryCommission):
   ```
   address notaryWallet, string name, string commissionNumber, 
   string stateCode, uint256 commissionExpiry, string stateBarNumber
   ```
   - Resolver: None
   - Revocable: Yes
   - Save UID → `NEXT_PUBLIC_EAS_SCHEMA_UID_NOTARY=0x...`

3. Register Schema 2 (NotarialAct):
   ```
   bytes32 docHash, address notary, address signer, bytes32 ipfsCid, 
   bytes32 docType, bytes32 stateCode, uint256 timestamp, bytes32 txHash
   ```
   - Resolver: None
   - Revocable: No
   - Save UID → `NEXT_PUBLIC_EAS_SCHEMA_UID_ACT=0x...`

4. Test: Create one attestation at https://base-sepolia.easscan.org/attest/create — verify it works

### Block 4 (2:30-3:00) — Next.js Scaffold + Vercel Deploy

```bash
cd /home/z/my-project/opennotary
npm create rainbowkit@latest
# Project name: opennotary (or use current dir)

# Install all deps
npm install @ethereum-attestation-service/eas-sdk @web3-storage/w3up-client \
            @tanstack/react-query react-hook-form zod @hookform/resolvers \
            framer-motion lucide-react sonner date-fns qrcode.react \
            @vercel/kv clsx tailwind-merge class-variance-authority

# Init shadcn
npx shadcn@latest init
npx shadcn@latest add button card dialog form input label toast badge tabs

# Create .env.local (fill in your saved values)
# Run dev
npm run dev
# Open http://localhost:3000 — wallet connect works

# Push to GitHub
git init
git add .
git commit -m "Day 1: scaffold + contract deployed"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/opennotary.git
git push -u origin main

# Connect to Vercel: https://vercel.com/dashboard → Add New Project → Import repo
# Add env vars in Vercel dashboard (paste from .env.local)
# Deploy
# Open https://opennotary.vercel.app on your phone
# Test wallet connect on iPhone Safari + Android Chrome
```

✅ Day 1 end: Live URL on mobile. Wallet connects. (App is ugly — that's fine.)

---

## 8. DAY 2-3 DETAIL (TECHNICAL)

### Day 2 — Core Flows (5 hours)

| Time | Task | OSS I lean on |
|---|---|---|
| 0:00-1:00 | `lib/wallet.ts`, `lib/contract.ts`, `lib/attest.ts` wrappers | Read `eas-is-true` for patterns |
| 1:00-2:00 | `/notary/register` page — notary self-attest commission via EAS | shadcn form block |
| 2:00-3:00 | `/notarize` wizard step 1 + 2 — upload + IPFS + wallet sign EIP-712 | shadcn wizard + Web3.Storage SDK |
| 3:00-4:00 | Wizard step 3 — confirm tx + EAS attestation issued + success state | wagmi `useSendTransaction` |
| 4:00-5:00 | `/verify/[docHash]` page — read EAS attestation + render basic timeline | EAS SDK `getAttestation()` |

### Day 3 — Complete Stack (5 hours)

| Time | Task | OSS I lean on |
|---|---|---|
| 0:00-1:00 | `lib/anchor.ts` OpenTimestamps integration + `/api/anchor/btc` | `opentimestamps-client` JS |
| 1:00-2:00 | `lib/usdc.ts` — USDC settlement flow | OpenZeppelin IERC20 pattern |
| 2:00-3:00 | `/notary/dashboard` with Vercel KV read-through cache | `@vercel/kv` |
| 3:00-4:00 | `/legal` regulatory memo page with citations | Static content + shadcn typography |
| 4:00-5:00 | Deploy to Vercel + custom domain (optional) + mobile test | Vercel dashboard |

✅ Day 3 end: Technical app 100% complete. Live URL on mobile. Real wallet, real EAS attestation, real Bitcoin anchor, real USDC settlement, real IPFS uploads. Ugly but functional.

---

## 9. DAY 4-17 DETAIL (POLISH + DEMO)

### Days 4-6 — Hero + Landing Polish (24 hrs)

- Big hero typography (Plus Jakarta Sans 36px mobile)
- Gradient mesh background (dark navy + gold accents)
- Animated notary seal motif (framer-motion rotating SVG)
- Primary CTA "Notarize a document" (gold #C8A968) with subtle glow
- Secondary CTA "Become a notary" (white outline)
- Glassmorphic stats card "4.4M notaries · $400M market · 42 states"
- Trust badges row "Built on Base · EAS · OpenTimestamps"
- Demo video embed (muted autoplay, plays inline)

### Days 7-9 — Notarize Wizard Animations (24 hrs)

- Drag-drop upload zone with smooth scale + gold glow on hover
- AI doc-type detection spinner "Analyzing document type..." → "Detected: Power of Attorney"
- Wallet sign bottom sheet (mobile) with drag-to-dismiss
- EIP-712 signature request modal — RainbowKit style
- Success state: green checkmark scales in → confetti burst → "Notarization complete!"
- "View on Basescan" + "Download verify URL" CTAs

### Days 9-10 — Verify "Wow Moment" (16 hrs, differentiator)

- Animated green checkmark drops in with stamp impression effect (stamp sound effect optional)
- "Verified authentic" headline (Plus Jakarta Sans 48px italic)
- Chain-of-custody vertical SVG timeline with 4 connected nodes:
  1. Uploaded → IPFS CID + link to gateway
  2. Ethereum anchored → tx hash + Basescan link
  3. Bitcoin anchored → OTS proof + opentimestamps.org verifier link
  4. Witness co-signed (if applicable)
- Cascade reveal animation (each node +120ms delay)
- "Share verify URL" button with QR code
- Subtle gold radial glow at top center
- Reference: Etherscan green checkmark + timestamp + block height header

### Days 10-11 — Dashboard Bento Grid (16 hrs)

- 4 stats cards in 2x2 grid (mobile):
  - "Total acts" big number + delta indicator
  - "Earnings" big USDC number + this month
  - "Commission status" with progress bar to expiry
  - "Recent acts" preview (top 3)
- Below: full recent acts list with hover effects
- Pull-to-refresh on mobile
- Floating action button "+ Notarize for client"

### Days 11-12 — Mobile + Dark Mode + States (16 hrs)

- Bottom navigation: Home · Notarize · Verify · Profile (sticky, 56px, gold underline active)
- Sticky bottom CTA on wizard (64px, scales up 2px on press)
- Bottom-sheet modals (not centered) with drag-to-dismiss
- Dark mode default + light mode toggle in profile
- All error/empty/loading states — skeletons for every wallet state (rejected tx, wrong chain, insufficient gas)
- Mobile responsive breakpoints (sm: 640px, md: 768px, lg: 1024px)
- Accessibility pass (aria-labels, keyboard nav, focus rings)

### Days 12-13 — Regulatory Memo Page (12 hrs)

- Serif typography (Plus Jakarta Sans + Inter body, JetBrains Mono for citations)
- Sidebar TOC with section links
- Footnote citations to:
  - UETA §7 (electronic records)
  - ESIGN Act §101(c) (electronic signatures)
  - e-IDAS QES (EU qualified electronic signature)
  - MiCA Regulation (EU) 2023/1114 Art. 60
  - SEC Rule 17a-4(f)(2) (records preservation)
  - GDPR Art. 5(1)(f) (integrity and confidentiality)
  - UCC Article 12 §12-105 (controllable electronic records)
- Each citation maps to a feature in the app ("Yes — your hash anchor satisfies UETA §7's 'electronic record' requirement")

### Days 13-14 — README + Demo Script + Screenshots (12 hrs)

- `README.md` final polish:
  - "Built With" disclosure table
  - Bounty track mapping (which bounties we target and why)
  - Screenshots + GIFs of key flows
  - Architecture diagram
  - Live URL + contract address + EAS schema UIDs
  - Setup instructions for judges
- `demo-script.md`:
  - 90-second video shot list
  - Voiceover text (lawyer-friendly, zero technical terms)
  - Screen recording instructions

### Day 15 — Demo Video Production (8 hrs)

- Script: 90 seconds, lawyer-friendly voiceover
- Shot list:
  | Time | Beat |
  |---|---|
  | 0:00-0:05 | "Notarize charges $25 per stamp. We charge $1. Same legal act." |
  | 0:05-0:20 | Notary onboarding — wallet connect + BLI attestation |
  | 0:20-0:45 | Notarize — signer uploads POA + wallet sign + notary co-sign + $1 USDC settles |
  | 0:45-1:05 | Verify — paste doc hash → green checkmark → timeline → Basescan + OTS proof |
  | 1:05-1:20 | B2B API — show webhook delivery. "Clio, MyCase, Smokeball — 2 lines and your clients get $1 notarization." |
  | 1:20-1:30 | "4.4M notaries. $400M market growing to $2B. $1 per stamp. Open rails. We're OpenNotary." |
- Recording: $20 lavalier mic (per teacher's recommendation) — NOT laptop mic
- Editing: 90 sec exact, no fluff
- Upload: YouTube unlisted + direct file for DoraHacks submission

### Day 16 — Buffer (8 hrs)

- Fix what breaks
- Iterate on demo video if needed
- Polish any weak states
- Final QA on mobile + desktop
- Press release copy for DoraHacks submission description

### Day 17 — SUBMIT (4 hrs)

- Final deploy to Vercel (production)
- Final contract verification on Basescan
- Test live URL one more time on mobile + desktop
- Submit on DoraHacks:
  - Repo URL: `https://github.com/YOUR_USERNAME/opennotary`
  - Demo video: YouTube unlisted link
  - Live URL: `https://opennotary.vercel.app`
  - Description: pitch + technical architecture + bounty mapping
  - Author info + team
- ✅ SUBMITTED

---

## 10. DAY 18 (DO NOTHING)

| Rule | Why |
|---|---|
| No git push | Could break the deployed version |
| No Vercel redeploy | Could fail silently |
| No "quick fix" | Could break something subtle |
| No last-minute design changes | Could break judging expectations |
| Just don't touch | Already submitted. Let it sit. |

---

## 11. RISKS + MITIGATIONS

### Teacher's Identified Risks (All Addressed)

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Base Sepolia faucet drought | High | Critical | Request testnet ETH from Base Discord today (Day 1) — don't wait |
| EAS schema UID changes | Medium | High | Hardcode after registration, add assert in build |
| USDC contract on Sepolia | Medium | High | Use `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (official Base Sepolia USDC) |
| Vercel KV cold start | Medium | Medium | Warm cache on deployment with a cron hit |
| iOS Safari wallet connection | High | Medium | Test RainbowKit on real iPhone Day 3, not Chrome DevTools |
| Demo video audio quality | Medium | High | Buy $20 lavalier mic, not laptop mic |

### Architecture Risks (All Mitigated in Contract)

| Risk | Mitigation |
|---|---|
| Reentrancy | OpenZeppelin `ReentrancyGuard` on `notarize()` |
| Replay attacks | Per-account EIP-712 nonce (OpenZeppelin `Nonces`) |
| Phishing (msg.sender spoofing) | ECDSA.recover verifies both signatures |
| Smart contract bugs | OpenZeppelin Wizard base + `forge test` + Basescan verification |
| Emergency response | `pause()` + `revokeNotary()` + `revokeAct()` |
| KYC fraud | BLI-issued EAS attestation as trust anchor + roadmap to World ID |
| Document tampering | SHA-256 hash anchored on Ethereum + Bitcoin (OpenTimestamps) |
| Privacy | Document content on IPFS, only hash on-chain |

### Strategic Risks

| Risk | Mitigation |
|---|---|
| BLI doesn't respond to attestation request | Fallback: self-attested EAS schema with prominent "Production: BLI attestation" note in README |
| State RON law fragmentation | Start with 5 permissive states (VA, FL, TX, NV, OH) — covers 40% of US supply |
| Network effect chicken-and-egg | Seed 10-20 notaries from BLI/Maryland Blockchain community; first 100 notaries free lifetime onboarding |
| No team backup for Days 10-17 | Post in DoraHacks Discord Day 1 — looking for designer |
| Smart contract security audit | Use OpenZeppelin primitives + forge tests + Basescan verification. README notes production would get a formal audit (Trail of Bits / OpenZeppelin) |

---

## 12. BOUNTY COVERAGE

DoraHacks allows one BUIDL to enter multiple bounty tracks. OpenNotary hits every tag:

| Tag | How we hit it |
|---|---|
| **Legal** | It's literally a notarization protocol |
| **Blockchain** | Smart contract on Base |
| **Crypto** | USDC fee settlement |
| **Finance** | $1 fee flow + B2B title bundles |
| **Compliance** | BLI-issued EAS attestation as sovereign KYC |
| **AI** | LLM doc-type detection + PII flagging (Day 9-10) |
| **RWA** | Notarized doc = UCC Article 12 controllable electronic record |
| **RegTech** | Self-sovereign compliance via EAS — no Stripe KYC vendor |
| **Bitcoin** | OpenTimestamps dual-anchor (free, no API key) |
| **Ethereum** | Smart contract + EAS on Base |

### Predicted Bounty Themes

| Theme | OpenNotary hook |
|---|---|
| Bitcoin anchor | OpenTimestamps dual-anchor |
| Ethereum / Base | Smart contract + EAS on Base |
| AI in legal | LLM doc-type detection + PII flagging |
| Compliance / RegTech | Self-sovereign compliance via EAS — no Stripe KYC vendor |
| RWA | UCC Article 12 controllable electronic record |
| Legal evidence / notary | It's literally a notarization protocol |
| Finance | USDC fee settlement + B2B title bundles |

**Even winning 2 bounties at $1K-$25K each beats the $20K grand prize split.**

---

## 13. PRE-FLIGHT CHECKLIST (Before Day 1 Code)

- [ ] Send BLI attestation email (file: `/home/z/my-project/download/bli-attestation-email.md`)
- [ ] Post in DoraHacks Discord for designer (#find-a-team)
- [ ] Get Base Sepolia ETH from faucet (https://www.alchemy.com/faucets/base-sepolia)
- [ ] Sign up for Alchemy + create Base Sepolia app
- [ ] Sign up for Web3.Storage + get token
- [ ] Sign up for Vercel + create KV database
- [ ] Sign up for WalletConnect Cloud + create project
- [ ] Create GitHub repo (public, name: `opennotary`)
- [ ] Create Vercel account + connect GitHub
- [ ] Test RainbowKit on actual iPhone (Safari) + Android (Chrome) — visit https://rainbowkit.com
- [ ] Draft saved test attestation UID for testing

---

## 14. SUBMISSION CHECKLIST (Day 17)

- [ ] All env vars set in Vercel dashboard (production)
- [ ] Contract deployed on Base Sepolia + verified on Basescan
- [ ] EAS schemas registered (2 UIDs)
- [ ] Live URL works on mobile (iPhone Safari + Android Chrome)
- [ ] Wallet connect works on mobile (deep-links to Rainbow/MetaMask mobile)
- [ ] Notarize flow works end-to-end (real wallet + real tx + real EAS attestation + real USDC settlement + real Bitcoin anchor)
- [ ] Verify URL works (paste any doc hash → green checkmark + timeline)
- [ ] README has "Built With" disclosure + bounty mapping + screenshots
- [ ] THIRD_PARTY_NOTICES.md has all OSS attributions
- [ ] 90-sec demo video recorded + uploaded to YouTube unlisted
- [ ] Repo is public on GitHub
- [ ] Submit on DoraHacks with: repo URL + demo video + live URL + description
- [ ] Confirm submission receipt from DoraHacks

---

## 15. REFERENCE LINKS

### Verified Active URLs (visit on mobile to test)

| URL | Purpose |
|---|---|
| https://rainbowkit.com | Wallet connection reference (tap "Connect Wallet" for mobile flow) |
| https://attest.org | EAS official site (what we integrate) |
| https://opentimestamps.org | Bitcoin anchor (free, no key) |
| https://sepolia.basescan.org | Block explorer (testnet) |
| https://web3.storage | IPFS pinning service |
| https://supabase.com | (skipped — we use Vercel KV) |
| https://wizard.openzeppelin.com | Smart contract generator |
| https://getfoundry.io | Foundry docs |
| https://stripe.com | Design polish reference (gold + black) |
| https://linear.app | Dark mode polish reference |
| https://rainbow.me | Web3 product polish reference |
| https://app.uniswap.org | Real dApp wallet flow on mobile |
| https://app.aave.com | Real DeFi wallet flow |
| https://etherscan.io | Verify page UX reference (green checkmark + block height) |

### Code Repositories (Verified Active)

| Repo | URL |
|---|---|
| RainbowKit | https://github.com/rainbow-me/rainbowkit |
| wagmi | https://github.com/wevm/wagmi |
| viem | https://github.com/wevm/viem |
| @tanstack/react-query | https://github.com/TanStack/query |
| shadcn/ui | https://github.com/shadcn-ui/ui |
| tailwindcss | https://github.com/tailwindlabs/tailwindcss |
| lucide-react | https://github.com/lucide-icons/lucide |
| framer-motion | https://github.com/framer/motion |
| react-hook-form | https://github.com/react-hook-form/react-hook-form |
| zod | https://github.com/colinhacks/zod |
| OpenZeppelin Contracts | https://github.com/OpenZeppelin/openzeppelin-contracts |
| Foundry | https://github.com/foundry-rs/foundry |
| EAS SDK | https://github.com/ethereum-attestation-service/eas-sdk |
| EAS reference app | https://github.com/ethereum-attestation-service/eas-is-true |
| Web3.Storage w3up-client | https://github.com/web3-storage/w3up |
| OpenTimestamps | https://github.com/opentimestamps |
| Supabase JS (skipped) | https://github.com/supabase/supabase-js |
| Stripe Node SDK (skipped) | https://github.com/stripe/stripe-node |
| Next.js | https://github.com/vercel/next.js |
| React | https://github.com/facebook/react |

---

## 16. FILE INVENTORY (What's Already Written)

### ✅ Day 1 Deliverables (Ready Now)

| File | Path | Status |
|---|---|---|
| BLI attestation email | `/home/z/my-project/download/bli-attestation-email.md` | ✅ Ready to send |
| Day 1 cheat sheet | `/home/z/my-project/download/day1-cheatsheet.md` | ✅ Print + follow |
| Mobile hero mockup | `/home/z/my-project/download/opennotary_hero.png` | ✅ View on phone |
| Mobile verify mockup | `/home/z/my-project/download/opennotary_verify.png` | ✅ View on phone |
| Master plan (this file) | `/home/z/my-project/download/opennotary-master-plan.md` | ✅ Single source of truth |
| Smart contract | `/home/z/my-project/opennotary/contracts/src/NotaryRegistry.sol` | ✅ 370 LOC, deployable |
| Deploy script | `/home/z/my-project/opennotary/contracts/script/DeployNotaryRegistry.s.sol` | ✅ One command |
| Test suite | `/home/z/my-project/opennotary/contracts/test/NotaryRegistry.t.sol` | ✅ 9 tests + Mock USDC |
| Foundry config | `/home/z/my-project/opennotary/contracts/foundry.toml` | ✅ Ready |
| Contracts env template | `/home/z/my-project/opennotary/contracts/.env.example` | ✅ All vars |
| Contracts .gitignore | `/home/z/my-project/opennotary/contracts/.gitignore` | ✅ Protects .env |
| Contracts README | `/home/z/my-project/opennotary/contracts/README.md` | ✅ Deploy instructions |
| Top-level README | `/home/z/my-project/opennotary/README.md` | ✅ Pitch + architecture |
| Third-party notices | `/home/z/my-project/opennotary/THIRD_PARTY_NOTICES.md` | ✅ Full attribution |

### ⏳ Day 2-3 Deliverables (I Write Next After Day 1 Tasks Done)

- `src/app/layout.tsx` + `src/app/page.tsx` (landing)
- `src/app/notarize/page.tsx` (3-step wizard)
- `src/app/notary/register/page.tsx` + `src/app/notary/dashboard/page.tsx`
- `src/app/verify/page.tsx` + `src/app/verify/[docHash]/page.tsx`
- `src/app/legal/page.tsx`
- `src/app/api-docs/page.tsx`
- `src/app/api/notary/register/route.ts` + 5 more API routes
- `src/components/ui/` (shadcn components)
- `src/components/wallet-connect-button.tsx` + 7 more custom components
- `src/lib/wallet.ts` + `lib/contract.ts` + `lib/attest.ts` + `lib/storage.ts` + `lib/eip712.ts` + `lib/anchor.ts` + `lib/usdc.ts` + `lib/ratelimit.ts` + `lib/schemas.ts` + `lib/queries.ts` + `lib/kv.ts` (11 wrappers)
- `package.json` with all 22 deps
- `next.config.ts` + `tailwind.config.ts`
- `.env.example` for frontend
- `.gitignore` for frontend

### ⏳ Day 4-17 Deliverables (Design + Polish)

- Hero animations + gradient mesh background
- Notary seal SVG (logo + watermark + loading state)
- Notarize wizard drag-drop + animations + success confetti
- Verify page animated green checkmark stamp + chain-of-custody SVG timeline
- Notary dashboard bento grid
- Bottom navigation + sticky CTAs + bottom-sheet modals
- Dark mode default + light mode toggle
- All error/empty/loading states
- Regulatory memo page with serif typography + sidebar TOC
- 90-sec demo video
- Final README polish + bounty mapping

---

## 🚀 YOUR MOVE — START HERE

### Step 1 — Send BLI Email (NOW)

Open `/home/z/my-project/download/bli-attestation-email.md`. Copy the body. Paste to:
- https://dorahacks.io/hackathon/legal-hack-2026/qa (post as question)
- BLI Discord (if you have access)

### Step 2 — Start Day 1 Cheat Sheet (NOW)

Open `/home/z/my-project/download/day1-cheatsheet.md`. Print it. Follow Block 1 → Block 2 → Block 3 → Block 4.

### Step 3 — Reply to Me With

When Block 1 is done:
```
"Block 1 done. EAS schema UIDs: 0x..., 0x...
Contract address: 0x...
Repo URL: https://github.com/YOUR_USERNAME/opennotary"
```

I write Day 2-3 code (Next.js app + 11 lib wrappers + 4 pages + 6 API routes) immediately. You get a live mobile URL by end of Day 3.

---

**END OF MASTER PLAN. This is the single source of truth. Reference it any time over the next 17 days.**
