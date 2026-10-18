# Third-Party Notices

OpenNotary is built on open-source software. This file lists every third-party
dependency of the application (`package.json` + `node_modules`) and of the
contracts (Foundry `lib/`), with the version actually resolved at the time of
writing, its license, and its source. We are grateful to the authors of all of
these projects.

License summary: every dependency is permissive (MIT / Apache-2.0 / ISC /
BSD-style) **except `javascript-opentimestamps`, which is LGPL-3.0** — see the
callout below.

## Application dependencies (npm)

| Name | Version | License | Source |
|---|---|---|---|
| next | 16.4.2 | MIT | https://github.com/vercel/next.js |
| react | 19.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 19.3.1 | MIT | https://github.com/facebook/react |
| typescript | 5.9.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @rainbow-me/rainbowkit | 2.2.11 | MIT | https://github.com/rainbow-me/rainbowkit |
| wagmi | 2.19.5 | MIT | https://github.com/wevm/wagmi |
| viem | 2.38.0 | MIT | https://github.com/wevm/viem |
| @tanstack/react-query | 5.104.3 | MIT | https://github.com/TanStack/query |
| tailwindcss | 4.3.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| @tailwindcss/postcss | 4.3.3 | MIT | https://github.com/tailwindlabs/tailwindcss |
| lucide-react | 1.58.0 | ISC | https://github.com/lucide-icons/lucide |
| class-variance-authority | 0.7.1 | Apache-2.0 | https://github.com/joe-bell/cva |
| clsx | 2.1.1 | MIT | https://github.com/lukeed/clsx |
| tailwind-merge | 3.7.0 | MIT | https://github.com/dcastil/tailwind-merge |
| @radix-ui/react-avatar | 1.3.1 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-dialog | 1.3.1 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-dropdown-menu | 2.2.1 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-label | 2.1.17 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-slot | 1.5.0 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-tabs | 1.2.1 | MIT | https://github.com/radix-ui/primitives |
| @radix-ui/react-tooltip | 1.4.1 | MIT | https://github.com/radix-ui/primitives |
| framer-motion | 14.3.0 | MIT | https://github.com/motiondivision/motion |
| react-hook-form | 7.90.0 | MIT | https://github.com/react-hook-form/react-hook-form |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
| @hookform/resolvers | 5.9.1 | MIT | https://github.com/react-hook-form/resolvers |
| @ethereum-attestation-service/eas-sdk | 2.10.0 | MIT | https://github.com/ethereum-attestation-service/eas-sdk |
| @web3-storage/w3up-client | 17.3.0 | Apache-2.0 OR MIT | https://github.com/storacha/w3up |
| javascript-opentimestamps | 0.4.5 | **LGPL-3.0** | https://github.com/opentimestamps/javascript-opentimestamps |
| sonner | 2.0.8 | MIT | https://github.com/emilkowalski/sonner |
| date-fns | 4.4.0 | MIT | https://github.com/date-fns/date-fns |
| qrcode.react | 4.2.0 | ISC | https://github.com/zpao/qrcode.react |
| @vercel/kv | 3.0.0 | Apache-2.0 | https://github.com/vercel/storage |
| @base-ui/react | 1.9.0 | MIT | https://github.com/mui/base-ui |
| cn | 0.5.0 | MIT | https://github.com/shadcn-ui/cn |
| shadcn | 4.22.0 | MIT | https://github.com/shadcn-ui/ui |
| tw-animate-css | 1.4.0 | MIT | https://github.com/Wombosvideo/tw-animate-css |

### Transitive dependencies of note

These are not direct `package.json` entries (except the `@x402/*` quartet, which
is declared because `@coinbase/cdp-sdk` requires it as a peer/resolution
dependency), but they ship in the dependency tree and are named here for
attribution completeness.

| Name | Version | License | Source | Relationship |
|---|---|---|---|---|
| @coinbase/cdp-sdk | 1.58.0 | MIT | https://github.com/coinbase/cdp-sdk | transitive dependency |
| @x402/core | 2.28.0 | Apache-2.0 | https://github.com/x402-foundation/x402 | resolution (peer) dep of @coinbase/cdp-sdk |
| @x402/evm | 2.28.0 | Apache-2.0 | https://github.com/x402-foundation/x402 | resolution (peer) dep of @coinbase/cdp-sdk |
| @x402/extensions | 2.28.0 | Apache-2.0 | https://github.com/x402-foundation/x402 | resolution (peer) dep of @coinbase/cdp-sdk |
| @x402/svm | 2.28.0 | Apache-2.0 | https://github.com/x402-foundation/x402 | resolution (peer) dep of @coinbase/cdp-sdk |
| @wagmi/connectors | 6.2.0 | MIT | https://github.com/wevm/wagmi | transitive via wagmi |
| ethers | 6.17.0 | MIT | https://github.com/ethers-io/ethers.js | transitive via @ethereum-attestation-service/eas-sdk |

### Development dependencies (npm)

| Name | Version | License | Source |
|---|---|---|---|
| vitest | 3.2.7 | MIT | https://github.com/vitest-dev/vitest |
| @testing-library/react | 16.3.3 | MIT | https://github.com/testing-library/react-testing-library |
| jsdom | 26.1.0 | MIT | https://github.com/jsdom/jsdom |
| @vitejs/plugin-react | 4.7.0 | MIT | https://github.com/vitejs/vite-plugin-react |
| eslint-config-next | 16.4.2 | MIT | https://github.com/vercel/next.js |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/node | 24.19.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Contract-side dependencies (Foundry `lib/`)

| Name | Version | License | Source |
|---|---|---|---|
| @openzeppelin/contracts (`lib/openzeppelin-contracts`) | 5.7.0 | MIT | https://github.com/OpenZeppelin/openzeppelin-contracts |
| forge-std (`lib/forge-std`) | 1.17.0 | Apache-2.0 OR MIT | https://github.com/foundry-rs/forge-std |

Toolchain: Foundry (forge/anvil/cast), solc 0.8.24.

## LGPL-3.0 callout — `javascript-opentimestamps`

`javascript-opentimestamps` (v0.4.5) is licensed under the **GNU Lesser General
Public License v3.0**, and is the only non-permissive license in the tree. It is
used at arm's length as a library for creating and verifying OpenTimestamps
proofs against the Bitcoin blockchain, is not modified, and is dynamically
linked (npm dependency, not vendored source). Users of OpenNotary retain the
LGPL-3.0 rights to replace and relink this library. Its upstream is
https://github.com/opentimestamps/javascript-opentimestamps. The license text
ships with the package at `node_modules/javascript-opentimestamps/LICENSE`.

## Design patterns adopted from

OpenNotary's implementation follows documented patterns and examples from the
projects below. No source files were copied verbatim; these are the
pattern/adoption references:

- RainbowKit documentation — wallet connection setup (`getDefaultConfig`, theming)
- wevm/wagmi examples — `readContract` / `writeContract` / hook usage patterns
- ethereum-attestation-service/eas-is-true — EAS attestation issuance and lookup flow
- web3-storage/w3up examples — IPFS upload / content addressing usage
- viem documentation — typed contract reads, ABI encoding, clients and transports
- opentimestamps/javascript-opentimestamps — calendar proof creation and verification usage
- OpenZeppelin IERC20 documentation — ERC-20 `transferFrom` settlement pattern
- zod documentation — schema-first form and input validation
- TanStack Query documentation — `useQuery` cache/stale-time patterns for RPC reads
- Vercel KV examples — read-through caching with TTL
- shadcn/ui — component scaffolding conventions (components.json / `cn` utility)
