import type { Metadata } from 'next';

import { NotaryDashboard } from '@/components/notary-dashboard';

export const metadata: Metadata = {
  title: 'Notary dashboard — OpenNotary',
  description:
    'Your notarial practice: total acts, USDC earnings, commission status and recent acts.',
};

/** Notary dashboard page. */
export default function NotaryDashboardPage() {
  return <NotaryDashboard />;
}
