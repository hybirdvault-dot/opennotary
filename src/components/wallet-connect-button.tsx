'use client';

/**
 * Thin wrapper around RainbowKit's `<ConnectButton />` — the single wallet
 * entry point for the app. Deep-links to mobile wallets automatically.
 */
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { cn } from '@/lib/utils';

export interface WalletConnectButtonProps {
  className?: string;
  /** Show the chain pill next to the account (default true). */
  showChain?: boolean;
}

export function WalletConnectButton({ className, showChain = true }: WalletConnectButtonProps) {
  return (
    <div
      className={cn(
        // Min 44×44 tap targets on mobile (RainbowKit buttons included).
        'inline-flex min-h-11 min-w-11 items-center justify-center',
        '[&_button]:min-h-11 [&_button]:min-w-11',
        className,
      )}
    >
      <ConnectButton
        showBalance={false}
        chainStatus={showChain ? 'icon' : 'none'}
        accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
      />
    </div>
  );
}
