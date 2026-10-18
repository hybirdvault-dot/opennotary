import type { Metadata } from 'next';

import { NotarizeWizard } from '@/components/notarize-wizard';

export const metadata: Metadata = {
  title: 'Notarize a document — OpenNotary',
  description:
    'Upload a document, dual-sign it with EIP-712, settle $1 in USDC and receive an on-chain notarial act anchored on Ethereum + Bitcoin.',
};

/** Notarize page: hosts the 3-step wizard (all logic lives in the component). */
export default function NotarizePage() {
  return <NotarizeWizard />;
}
