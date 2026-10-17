/**
 * Wallet stack configuration for OpenNotary (RainbowKit + wagmi).
 *
 * Pure configuration module: no React components live here. The app consumes
 * {@link wagmiConfig} in its providers and {@link rainbowKitTheme} on
 * `RainbowKitProvider`.
 *
 * Source pattern: RainbowKit installation docs (`getDefaultConfig` setup).
 */
import { darkTheme, getDefaultConfig } from '@rainbow-me/rainbowkit';
import type { Chain } from 'viem';
import { baseSepolia } from 'wagmi/chains';

/**
 * WalletConnect Cloud project id used by RainbowKit to broker wallet sessions.
 *
 * Read from `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; falls back to an empty
 * string when the variable is not configured.
 */
export const projectId: string = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

/**
 * The chains OpenNotary supports. Pinned to Base Sepolia for the hackathon.
 */
export const chains: readonly [Chain, ...Chain[]] = [baseSepolia];

/**
 * Return type of RainbowKit's `getDefaultConfig`: a fully wired wagmi
 * {@link https://wagmi.sh/core/config | Config} with injected + WalletConnect
 * connectors and automatic transports.
 */
export type CreateConfigReturnType = ReturnType<typeof getDefaultConfig>;

/**
 * Shared wagmi configuration for both server and client rendering
 * (`ssr: true` keeps hydration consistent in the Next.js App Router).
 */
export const wagmiConfig: CreateConfigReturnType = getDefaultConfig({
  appName: 'OpenNotary',
  projectId,
  chains,
  ssr: true,
});

/**
 * Theme object produced by RainbowKit's `darkTheme` factory.
 */
export type RainbowKitTheme = ReturnType<typeof darkTheme>;

/**
 * OpenNotary's branded RainbowKit theme: dark base with a gold accent
 * and large border radius.
 */
export const rainbowKitTheme: RainbowKitTheme = darkTheme({
  accentColor: '#C8A968',
  borderRadius: 'large',
});
