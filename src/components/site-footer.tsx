/**
 * Global site footer: navigation links, trust badges and the legal disclaimer
 * one-liner (pinned on the landing page; shared everywhere for consistency).
 */
import Link from 'next/link';

import { NotarySeal } from './notary-seal';

const FOOTER_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/notarize', label: 'Notarize a document' },
  { href: '/notary/register', label: 'Become a notary' },
  { href: '/verify', label: 'Verify a document' },
  { href: '/notary/dashboard', label: 'Notary dashboard' },
  { href: '/legal', label: 'Legal memo' },
] as const;

const TRUST_BADGES = ['Built on Base', 'EAS', 'OpenTimestamps'] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="flex max-w-sm flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <NotarySeal size={28} />
              <span className="font-heading text-base font-bold text-ink">
                Open<span className="text-gold">Notary</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-mist">
              $25 per stamp → $1. Same legal act — notary and signer both sign on-chain, attested
              via EAS and anchored on Ethereum + Bitcoin.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Trust badges">
              {TRUST_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-wide text-mist"
                >
                  {badge}
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="Footer navigation">
            <ul className="grid grid-cols-2 gap-x-10 gap-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-mist transition-colors hover:text-gold"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="border-t border-white/10 pt-6 text-xs leading-relaxed text-mist/80">
          Disclaimer: OpenNotary is a technology demonstration of electronic notarization
          infrastructure and does not provide legal advice; acceptance of electronic notarial acts
          varies by jurisdiction — consult a licensed attorney.
        </p>
      </div>
    </footer>
  );
}
