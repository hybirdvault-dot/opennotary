/**
 * Global site header: seal + wordmark on the left, desktop nav links and the
 * RainbowKit wallet button on the right. Mobile navigation lives in
 * {@link BottomNav}.
 */
import Link from 'next/link';

import { NotarySeal } from './notary-seal';
import { WalletConnectButton } from './wallet-connect-button';

const HEADER_LINKS = [
  { href: '/notarize', label: 'Notarize' },
  { href: '/verify', label: 'Verify' },
  { href: '/notary/dashboard', label: 'Dashboard' },
  { href: '/legal', label: 'Legal' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 py-1 transition-opacity hover:opacity-80"
          aria-label="OpenNotary home"
        >
          <NotarySeal size={32} />
          <span className="font-heading text-lg font-bold tracking-tight text-ink">
            Open<span className="text-gold">Notary</span>
          </span>
        </Link>

        <nav aria-label="Header navigation" className="hidden items-center gap-6 lg:flex">
          {HEADER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-mist transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <WalletConnectButton />
      </div>
    </header>
  );
}
