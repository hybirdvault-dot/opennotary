import type { Metadata } from 'next';

import { VerifyResult } from '@/components/verify-result';

export const metadata: Metadata = {
  title: 'Verified authentic — OpenNotary',
  description:
    'Public verification page: animated verdict, chain-of-custody timeline and shareable proof.',
};

/**
 * Public verify page (the differentiator). The server passes the URL hash down
 * to the client result component, which loads GET /api/verify/[docHash] —
 * the single source of truth — so the on-screen hash always matches the URL.
 */
export default async function VerifyDocHashPage({
  params,
}: {
  params: Promise<{ docHash: string }>;
}) {
  const { docHash } = await params;
  return <VerifyResult docHash={docHash} />;
}
