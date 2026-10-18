'use client';

/**
 * The verify "wow moment": an animated wax-seal verdict stamp.
 *
 * Choreography (framer-motion springs): the stamp drops in from above, scales
 * 1.4 → 1 with a slight rotation as if pressed onto the page, an impression
 * ripple radiates twice, and the central check/X draws itself in.
 * 100% custom SVG — the OpenNotary seal motif stamped in emerald or wax red.
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type VerdictVariant = 'verified' | 'revoked';

export interface VerdictStampProps {
  /** Verified (emerald check) or revoked (wax-red X). */
  variant: VerdictVariant;
  /** Rendered pixel size of the square stamp. */
  size?: number;
  className?: string;
}

const VARIANT_META: Record<
  VerdictVariant,
  { stroke: string; glow: string; arcTop: string; arcBottom: string; glyph: string }
> = {
  verified: {
    stroke: '#10B981',
    glow: 'rgba(16, 185, 129, 0.45)',
    arcTop: 'OPENNOTARY · VERIFIED',
    arcBottom: 'EAS · BASE SEPOLIA · BITCOIN',
    glyph: 'M 66 104 L 90 128 L 138 74',
  },
  revoked: {
    stroke: '#B8463F',
    glow: 'rgba(184, 70, 63, 0.45)',
    arcTop: 'OPENNOTARY · REVOKED',
    arcBottom: 'RECORD SUPERSEDED ON-CHAIN',
    glyph: 'M 74 74 L 128 128 M 128 74 L 74 128',
  },
};

const TICK_DEGREES = Array.from({ length: 24 }, (_, index) => index * 15);

export function VerdictStamp({ variant, size = 220, className }: VerdictStampProps) {
  const meta = VARIANT_META[variant];

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Impression ripples */}
      {[0.35, 0.6].map((delay) => (
        <motion.span
          key={delay}
          aria-hidden="true"
          className="absolute rounded-full border-2"
          style={{ width: size * 0.72, height: size * 0.72, borderColor: meta.glow }}
          initial={{ scale: 0.72, opacity: 0.55 }}
          animate={{ scale: 2.15, opacity: 0 }}
          transition={{
            scale: { type: 'spring', stiffness: 90, damping: 26, delay },
            opacity: { duration: 1.2, delay, ease: 'easeOut' },
          }}
        />
      ))}

      <motion.div
        initial={{ y: -72, scale: 1.4, rotate: -14, opacity: 0 }}
        animate={{ y: 0, scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 15, mass: 0.9 }}
        style={{ filter: `drop-shadow(0 12px 40px ${meta.glow})` }}
      >
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          role="img"
          aria-label={variant === 'verified' ? 'Verified authentic stamp' : 'Revoked stamp'}
        >
          <defs>
            <path id={`stamp-arc-top-${variant}`} d="M 100 100 m -74 0 a 74 74 0 1 1 148 0" fill="none" />
            <path
              id={`stamp-arc-bottom-${variant}`}
              d="M 26 100 a 74 74 0 0 0 148 0"
              fill="none"
            />
          </defs>

          <g stroke={meta.stroke} fill="none">
            <circle cx="100" cy="100" r="94" strokeWidth="7" opacity="0.95" />
            <circle cx="100" cy="100" r="80" strokeWidth="2" opacity="0.6" />
            {TICK_DEGREES.map((deg) => (
              <line
                key={deg}
                x1="100"
                y1="6"
                x2="100"
                y2="14"
                strokeWidth="3"
                opacity="0.7"
                transform={`rotate(${deg} 100 100)`}
              />
            ))}
            <circle cx="100" cy="100" r="58" strokeWidth="3" opacity="0.9" />
          </g>

          <g
            className="hash-text"
            fill={meta.stroke}
            fontSize="13.5"
            fontWeight="700"
            letterSpacing="3.2"
            opacity="0.95"
          >
            <text>
              <textPath href={`#stamp-arc-top-${variant}`} startOffset="50%" textAnchor="middle">
                {meta.arcTop}
              </textPath>
            </text>
            <text fontSize="9.5" letterSpacing="2.4" opacity="0.8">
              <textPath href={`#stamp-arc-bottom-${variant}`} startOffset="50%" textAnchor="middle">
                {meta.arcBottom}
              </textPath>
            </text>
          </g>

          <motion.path
            d={meta.glyph}
            fill="none"
            stroke={meta.stroke}
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
