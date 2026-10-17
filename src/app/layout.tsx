import type { Metadata } from 'next';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { Providers } from './providers';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'OpenNotary — The Stripe of Notarization',
  description:
    'Notarize.com charges $25 per document. We charge $1. Same legal act — notary and signer both sign on-chain via EIP-712, attested via EAS, anchored on Ethereum + Bitcoin, settled in USDC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
