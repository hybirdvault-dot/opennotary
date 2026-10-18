'use client';

/**
 * Landing hero: rotating seal watermark, headline, the three CTAs (gold
 * primary with glow), the glassmorphic stats strip and the trust badges row.
 * All motion is framer-motion spring choreography.
 */
import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { NotarySeal } from './notary-seal';

const STATS = [
  { value: '4.4M', label: 'Notaries in the US' },
  { value: '$400M', label: 'RON market today' },
  { value: '42', label: 'States with RON laws' },
] as const;

const TRUST_BADGES = ['Built on Base', 'EAS', 'OpenTimestamps'] as const;

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
  },
};

const ctaSpring = { type: 'spring' as const, stiffness: 380, damping: 20 };

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Gold gradient mesh + rotating seal watermark */}
      <div aria-hidden="true" className="radial-gold pointer-events-none absolute inset-0" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
      >
        <NotarySeal size={560} spinning />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28"
      >
        <motion.p
          variants={itemVariants}
          className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-semibold tracking-[0.18em] text-gold uppercase"
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Electronic notarization infrastructure
        </motion.p>

        <motion.h1
          variants={itemVariants}
          className="font-heading max-w-4xl text-5xl leading-[1.05] font-bold tracking-tight text-ink sm:text-6xl lg:text-7xl"
        >
          The Stripe of <span className="text-gold">Notarization</span>
        </motion.h1>

        <motion.p variants={itemVariants} className="max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
          $25 per stamp → $1. Same legal act — notary and signer both sign on-chain.
        </motion.p>

        <motion.div variants={itemVariants} className="flex flex-col items-center gap-3 sm:flex-row">
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={ctaSpring}>
            <Link
              href="/notarize"
              aria-label="Notarize a document"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'h-12 rounded-xl bg-gold px-7 text-base font-semibold text-navy',
                'hover:bg-gold/90 glow-gold',
              )}
            >
              Notarize a document
              <ArrowRight aria-hidden="true" />
            </Link>
          </motion.div>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={ctaSpring}>
            <Link
              href="/notary/register"
              aria-label="Become a notary"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'h-12 rounded-xl border-white/25 px-7 text-base text-ink hover:bg-white/5 hover:text-ink',
              )}
            >
              Become a notary
            </Link>
          </motion.div>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={ctaSpring}>
            <Link
              href="/verify"
              aria-label="Verify a document"
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'h-12 rounded-xl px-6 text-base text-mist hover:bg-white/5 hover:text-ink',
              )}
            >
              <PlayCircle aria-hidden="true" />
              Verify a document
            </Link>
          </motion.div>
        </motion.div>

        {/* Glassmorphic stats strip */}
        <motion.dl
          variants={itemVariants}
          className="glass grid w-full max-w-3xl grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 px-6 py-6">
              <dt className="order-2 text-xs tracking-wide text-mist uppercase">{stat.label}</dt>
              <dd className="order-1 font-heading text-3xl font-bold text-ink">{stat.value}</dd>
            </div>
          ))}
        </motion.dl>

        {/* Trust badges */}
        <motion.ul
          variants={itemVariants}
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-mist"
          aria-label="Trust badges"
        >
          <li className="font-medium text-ink">Built on</li>
          {TRUST_BADGES.map((badge, index) => (
            <li key={badge} className="flex items-center gap-3">
              {index > 0 ? <span aria-hidden="true" className="text-gold/60">·</span> : null}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide">
                {badge}
              </span>
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </section>
  );
}
