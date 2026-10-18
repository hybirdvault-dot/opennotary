import type { Metadata } from 'next';

import { VerifySearch } from '@/components/verify-search';

export const metadata: Metadata = {
  title: 'Verify a document — OpenNotary',
  description:
    'Look up any notarial act by document hash or attestation UID and see its full chain of custody.',
};

/** Verify search page. */
export default function VerifyPage() {
  return <VerifySearch />;
}
