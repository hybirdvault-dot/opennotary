import type { Metadata } from 'next';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/bottom-nav';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

export const metadata: Metadata = {
  title: 'OpenNotary — Settlement & attestation rails for digital notarial acts',
  description:
    'The transaction layer for digital notarial acts: a $1 platform fee per act (99¢ to the notary, 1¢ protocol), settled in USDC on Base. Notarize.com’s $25 is full-service including the notary’s labour — our $1 is the platform fee. Verification is vendor-free: Ethereum, IPFS and Bitcoin OpenTimestamps.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn('dark font-sans', jakarta.variable, inter.variable, jetbrains.variable)}
    >
      <body>
        <Providers>
          <SiteHeader />
          <main className="min-h-screen pb-20">{children}</main>
          <SiteFooter />
          {/* Clearance so the fixed BottomNav (64px) never hides the footer. */}
          <div aria-hidden="true" className="h-20 bg-navy lg:hidden" />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
