# PINNED PHASE 3 SPEC v1.0 — Pages + API Routes

Source of truth for the Phase 3 build. Worker A implements against this; Worker B tests the real
flows against this. Master plan (full context): `docs/reference/opennotary-master-plan.md`.

**Stack (all installed):** Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui (15 components in
src/components/ui/), framer-motion, react-hook-form + zod v3, sonner (toasts), qrcode.react,
date-fns, lucide-react. Lib wrappers in src/lib/ are DONE and tested — use them, never re-implement
their logic. `src/lib/utils.ts` has `cn()`.

## DESIGN TOKENS (master plan decisions #21-28 — apply everywhere)
- Colors: bg `#0A0F1A` (dark navy, DEFAULT), surface `#111827`-ish glass cards, accent/gold `#C8A968`,
  success emerald `#10B981`, error wax red `#B8463F`, text `#E8E6E1`, muted `#9CA3AF`
- Type: Plus Jakarta Sans (headings, via next/font/google), Inter (body), JetBrains Mono (hashes)
- Spacing 8-pt grid (4/8/12/16/24/32/48/64/96). Radius: cards 16px, buttons 12px, pills full
- Motion: framer-motion springs (never linear): card hover lift, button press, page fade/slide,
  verify stamp + timeline cascade (+120ms stagger per node)
- Mobile-first: bottom nav (Home · Notarize · Verify · Profile — 56px, gold underline active),
  sticky bottom CTA on wizard (64px), bottom-sheet-style dialogs on mobile, min 44×44 tap targets,
  breakpoints sm:640 md:768 lg:1024. Wallet: RainbowKit `<ConnectButton />` (deep-links on mobile)
- Motif: notary seal — concentric rings SVG (logo, hero watermark, success stamp, loading spinner)
- Every state designed: loading (skeletons), empty, error (red wax + retry), success (green stamp)

## PAGE ROUTES (src/app/...)

### 1. `/` — Landing
Hero: "The Stripe of Notarization" + sub "$25 per stamp → $1. Same legal act — notary and signer both
sign on-chain." CTAs: gold "Notarize a document" (primary, glow) → /notarize · outline "Become a
notary" → /notary/register · ghost "Verify a document" → /verify. Glassmorphic stats strip
("4.4M notaries · $400M market · 42 states"). Trust badges ("Built on Base · EAS · OpenTimestamps").
Demo video placeholder block (muted autoplay when /public/demo-video.mp4 exists, else poster card).
Footer with nav links + legal disclaimer one-liner.

### 2. `/notarize` — 3-step wizard (client component; state machine, one step per screen on mobile)
- Step 1 Upload: drag-drop zone (gold glow hover), file input fallback, `notarizeSchema` validation
  (≤25MB), docType select + stateCode input, signer wallet address input. "Analyzing document
  type..." spinner beat (500ms simulated detect) → shows detected type (editable).
- Step 2 Sign: wallet connect (RainbowKit) if needed; USDC `approveUsdc(TOTAL_FEE)` step when
  allowance < TOTAL_FEE; then two EIP-712 signatures via lib/eip712 (`signSignerAcknowledgment` +
  `signNotaryAttestation`) — show the typed-data fields in a bottom-sheet summary before signing.
  Errors surfaced: rejected signature, wrong chain (prompt switch to Base Sepolia), insufficient gas.
- Step 3 Confirm: submit `/api/notarize`; progress beats (Uploading to IPFS → Recording on-chain →
  Attesting via EAS → Anchoring on Bitcoin); success: green check scales in, "Notarization
  complete!", hash-chip of docHash, CTAs "View on Basescan" (tx link) + "Open verify page" →
  /verify/[docHash]. docHash = keccak256 of the file bytes (compute client-side via viem).

### 3. `/notary/register` — Notary onboarding
react-hook-form + `notaryRegisterSchema` (notary address, commissionHash, stateCode, commissionExpiry).
Info card: KYC via BLI attestation (production note: "Production: BLI-issued EAS attestation".
Hackathon mode: self-attested with visible note). Submit → POST /api/notary/register → success card
(commission details + link to dashboard). Error + loading states.

### 4. `/notary/dashboard` — Notary stats (client; uses lib/queries hooks)
2×2 bento grid on mobile: "Total acts" (big number), "Earnings" (USDC big number + "this month"),
"Commission status" (progress bar to expiry, date-fns), "Recent acts" (top 3 rows). Below: full
recent acts list (hash-chip + timestamp + status pill) with hover effects. FAB gold
"+ Notarize for client" → /notarize. Empty state when zero acts. Pull-to-refresh optional.

### 5. `/verify` — Search
Single search field: paste docHash (bytes32 hex) or attestation UID → routes to /verify/[docHash].
`verifySchema` validation, invalid-input error state. Recent/quick demo links row.

### 6. `/verify/[docHash]` — ⚠️ 100% CUSTOM — THE DIFFERENTIATOR (no OSS page code copied)
- Load via GET /api/verify/[docHash] (or queries + API — one source of truth).
- Header: subtle gold radial glow; "Verified authentic" (Plus Jakarta Sans 48px italic) + animated
  green checkmark STAMP (drops in, scales 1.4→1, slight rotate, impression ripple — framer-motion).
  Revoked variant: wax-red stamp "Revoked". Not found: "No notarial act found" empty state with CTA.
- Chain-of-custody VERTICAL SVG TIMELINE — 4 connected nodes, cascade reveal +120ms each:
  1. Document uploaded → IPFS CID (hash-chip + gateway link)
  2. Ethereum anchored → tx hash (hash-chip + Basescan link) + timestamp + block ref
  3. Bitcoin anchored → OTS proof status + opentimestamps.org verifier link (pending = amber node)
  4. Witness co-signed (when applicable — EAS attestation UID row + easscan link)
- Header meta row (Etherscan pattern): docHash mono chip + copy, notary + signer address chips,
  timestamp (date-fns), fee settled ($1.00 USDC split shown).
- "Share verify URL" button + QR code (qrcode.react). Also on-screen hash matches URL param.

### 7. `/legal` — Regulatory memo
Long-form typography (Inter body 16-18px/1.7, JetBrains Mono citations), sticky sidebar TOC (lg+),
sections with footnote citations: UETA §7 · ESIGN Act §101(c) · e-IDAS QES · MiCA (EU) 2023/1114
Art. 60 · SEC Rule 17a-4(f)(2) · GDPR Art. 5(1)(f) · UCC Article 12 §12-105. Each section ends with
a "How OpenNotary satisfies this" feature-mapping callout card. Disclaimer footer ("not legal advice").

## API ROUTES (src/app/api/... route.ts) — JSON in/out, zod-validated (schemas + per-route), rate-limited (lib/ratelimit, 10/min per IP), never leak stack traces (500 → {error:"internal"}).

### POST /api/notary/register
Body: `notaryRegisterSchema` payload. → validates; records pending commission (KV via lib/kv as
cache-only); responds `{ok:true, notary, commissionExpiry, txHash?:null, note:"Production relayer
registers on-chain after BLI attestation"}`. 400 on invalid payload.

### POST /api/notarize
Body: `{docHash, notary, signer, ipfsCid, docType, stateCode, timestamp, notarySig, signerSig, txHash}`
(all hex-prefixed strings + bigint-as-string timestamp). → 1) verify EIP-712 sigs via lib/eip712
`verifySignature` (both) → 401 `{error:"invalid signature"}` on failure; 2) issue EAS attestation via
lib/attest `issueNotarialActAttestation` (relayer key env) → uid; 3) fire-and-forget BTC anchor:
POST internal /api/anchor/btc with `keccak256(docHash+txHash+uid)` digest (do not await); 4) cache
act via lib/kv. Respond `{ok:true, attestationUid, otsQueued:true}`.

### GET /api/verify/[docHash]
→ full act: on-chain act (lib/contract `getAct` with a read client), EAS attestation if any,
KV-cached extras, OTS status (`pending` until proof verifies). 404 `{error:"not found"}` when
`ActNotFound`. Never throws raw.

### GET /api/notary/[address]
→ `{notary: NotaryRecord|null, acts: Hex[], stats: {totalActs, earnings}}` (KV read-through:
`getCachedNotaryStats` first, else compute + `cacheNotaryStats`).

### POST /api/webhook/outbound
Body: `{targetUrl: url, event: string, payload: object}` → sends `fetch(targetUrl, POST)` with JSON
body + headers `X-OpenNotary-Event`, `X-OpenNotary-Signature: sha256=<HMAC-SHA256 hex of raw body
with WEBHOOK_SECRET env, node:crypto>` (Svix-style). Respond `{delivered:true, statusCode}` or 502
`{error:"delivery failed", statusCode}`. SSRF guard: only http(s), no localhost/private IPs.

### POST /api/anchor/btc
Body: `{digest: bytes32 hex}` → lib/anchor `stampHash` → `{ok, otsProof: base64}`; 503
`{error:"calendar unavailable"}` if the OTS calendar network fails. (Internal + demo.)

## SHARED COMPONENTS (src/components/): `wallet-connect-button.tsx` (RainbowKit wrapper),
`hash-chip.tsx` (mono + copy-to-clipboard + truncated), `bento-card.tsx`, `verdict-stamp.tsx`,
`chain-of-custody-timeline.tsx`, `notary-badge.tsx`, `bottom-nav.tsx`, `notary-seal.tsx` (SVG motif),
`section-heading.tsx`. Keep page files thin — logic in components + libs.

## QUALITY BAR (auditor will hunt): `npm run build` exit 0 (this is the gate); no `any`; no TODOs;
no dead code; loading/empty/error states on every data view; all external links `target="_blank"
rel="noreferrer"`; forms use react-hook-form + zod (schemas.ts); toasts (sonner) for user feedback;
aria-labels on interactive elements; no secrets in client code (EAS relayer key stays server-side).
