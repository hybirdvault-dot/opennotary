import { existsSync } from 'node:fs';
import path from 'node:path';
import { Clapperboard } from 'lucide-react';

import { LandingHero } from '@/components/landing-hero';
import { SectionHeading } from '@/components/section-heading';

/**
 * Landing page: hero + demo video block. The video auto-plays (muted) when
 * `public/demo-video.mp4` exists, otherwise a poster card is shown.
 */
export default function HomePage() {
  const demoAvailable = existsSync(path.join(process.cwd(), 'public', 'demo-video.mp4'));

  return (
    <div>
      <LandingHero />

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-label="Product demo">
        <SectionHeading
          eyebrow="See it in action"
          title="One document. Four immutable receipts."
          subtitle="Upload, dual-sign on EIP-712, settle $1 in USDC — then watch the chain of custody assemble itself on the verify page."
        />

        <div className="glass mt-10 overflow-hidden">
          {demoAvailable ? (
            <video
              className="aspect-video w-full object-cover"
              src="/demo-video.mp4"
              autoPlay
              muted
              loop
              playsInline
              aria-label="OpenNotary product demo"
            />
          ) : (
            <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_center,rgba(200,169,104,0.12),transparent_70%)]">
              <Clapperboard className="size-12 text-gold" aria-hidden="true" />
              <div className="text-center">
                <p className="font-heading text-xl font-semibold text-ink">
                  90-second product demo
                </p>
                <p className="mt-1 text-sm text-mist">
                  Notary onboarding → dual EIP-712 signatures → $1 USDC settlement → verified
                  chain of custody.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs tracking-wide text-mist">
                Demo video coming soon
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
