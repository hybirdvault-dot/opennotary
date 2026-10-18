'use client';

/**
 * Chain-of-custody vertical SVG timeline — the verify page's centerpiece.
 *
 * Four connected nodes (IPFS → Ethereum → Bitcoin → witness) rendered as an
 * SVG rail with node medallions and glass detail cards. Nodes cascade in at
 * +120ms each and each connector segment draws itself downward as its node
 * appears. Node states: done (emerald), pending (amber, e.g. an OTS proof
 * still at the calendar), skipped (muted, "not applicable").
 */
import { motion } from 'framer-motion';
import { BadgeCheck, Bitcoin, Blocks, Check, Clock, Database, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CustodyStatus = 'done' | 'pending' | 'skipped';

export type CustodyIcon = 'ipfs' | 'ethereum' | 'bitcoin' | 'witness';

export interface CustodyStep {
  /** Stable key for the node. */
  id: string;
  /** Node medallion icon. */
  icon: CustodyIcon;
  /** Node headline (e.g. "Ethereum anchored"). */
  title: string;
  /** Completion state of this custody step. */
  status: CustodyStatus;
  /** Detail rows: hash chips, links, timestamps. */
  children?: ReactNode;
}

const ICONS: Record<CustodyIcon, typeof Database> = {
  ipfs: Database,
  ethereum: Blocks,
  bitcoin: Bitcoin,
  witness: BadgeCheck,
};

const STATUS_META: Record<
  CustodyStatus,
  {
    ringClassName: string;
    iconClassName: string;
    lineColor: string;
    pillClassName: string;
    pillLabel: string;
    PillIcon: typeof Check;
  }
> = {
  done: {
    ringClassName: 'border-success/60 bg-success/10',
    iconClassName: 'text-success',
    lineColor: 'rgba(16, 185, 129, 0.45)',
    pillClassName: 'border-success/40 bg-success/10 text-success',
    pillLabel: 'Verified',
    PillIcon: Check,
  },
  pending: {
    ringClassName: 'border-amber-400/60 bg-amber-400/10',
    iconClassName: 'text-amber-400',
    lineColor: 'rgba(251, 191, 36, 0.4)',
    pillClassName: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
    pillLabel: 'Pending',
    PillIcon: Clock,
  },
  skipped: {
    ringClassName: 'border-white/15 bg-white/5',
    iconClassName: 'text-mist',
    lineColor: 'rgba(156, 163, 175, 0.25)',
    pillClassName: 'border-white/10 bg-white/5 text-mist',
    pillLabel: 'Not applicable',
    PillIcon: Minus,
  },
};

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const nodeVariants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

export interface ChainOfCustodyTimelineProps {
  /** Ordered custody steps (max 4 per the verify spec). */
  steps: CustodyStep[];
  className?: string;
}

export function ChainOfCustodyTimeline({ steps, className }: ChainOfCustodyTimelineProps) {
  return (
    <motion.ol
      variants={listVariants}
      initial="hidden"
      animate="show"
      aria-label="Chain of custody"
      className={cn('flex flex-col', className)}
    >
      {steps.map((step, index) => {
        const meta = STATUS_META[step.status];
        const NodeIcon = ICONS[step.icon];
        const PillIcon = meta.PillIcon;
        const isLast = index === steps.length - 1;
        return (
          <motion.li key={step.id} variants={nodeVariants} className="flex gap-4">
            {/* SVG rail: connector segment + node medallion */}
            <div className="relative w-11 shrink-0">
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                <motion.line
                  x1="22"
                  y1="0"
                  x2="22"
                  y2={isLast ? '40%' : '100%'}
                  stroke={meta.lineColor}
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: index * 0.12 + 0.08, duration: 0.45, ease: 'easeOut' }}
                />
              </svg>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 320,
                  damping: 18,
                  delay: index * 0.12,
                }}
                className={cn(
                  'relative z-10 flex size-11 items-center justify-center rounded-full border-2',
                  meta.ringClassName,
                )}
              >
                <NodeIcon className={cn('size-5', meta.iconClassName)} aria-hidden="true" />
              </motion.div>
            </div>

            {/* Detail card */}
            <div className="glass mb-6 flex-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-base font-semibold text-ink">{step.title}</h3>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                    meta.pillClassName,
                  )}
                >
                  <PillIcon className="size-3" aria-hidden="true" />
                  {meta.pillLabel}
                </span>
              </div>
              {step.children ? (
                <div className="mt-3 flex flex-col gap-2">{step.children}</div>
              ) : null}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}
