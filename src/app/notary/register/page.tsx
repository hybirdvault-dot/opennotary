import type { Metadata } from 'next';

import { NotaryRegisterForm } from '@/components/notary-register-form';
import { SectionHeading } from '@/components/section-heading';

export const metadata: Metadata = {
  title: 'Become a notary — OpenNotary',
  description:
    'Register your notary commission on OpenNotary: keep 99¢ of every $1 notarization fee with on-chain credentialing.',
};

/** Notary onboarding page: heading + register form. */
export default function NotaryRegisterPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <SectionHeading
        eyebrow="Notary onboarding"
        title="Become an OpenNotary notary"
        subtitle="Register your commission once, then keep 99¢ of every $1 stamp — your acts stay verifiable without OpenNotary’s infrastructure, and there’s no 50-90% platform cut."
        align="left"
        as="h1"
      />
      <div className="mt-10">
        <NotaryRegisterForm />
      </div>
    </div>
  );
}
