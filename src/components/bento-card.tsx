'use client';

/**
 * Glassmorphic bento grid card with a spring hover lift and press feedback.
 * Accepts either structured stat content (title/value/caption/icon) or free
 * children.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BentoCardProps {
  /** Small muted label (e.g. "Total acts"). */
  title?: string;
  /** Big display value (e.g. "42" or "$41.58"). */
  value?: string;
  /** Caption under the value (e.g. "this month"). */
  caption?: string;
  /** Optional icon rendered top-right. */
  icon?: ReactNode;
  /** Free-form content below the structured header. */
  children?: ReactNode;
  className?: string;
}

export function BentoCard({ title, value, caption, icon, children, className }: BentoCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className={cn('glass flex flex-col gap-2 p-5', className)}
    >
      {(title ?? icon) ? (
        <div className="flex items-center justify-between gap-2">
          {title ? <p className="text-sm font-medium text-mist">{title}</p> : <span />}
          {icon ? (
            <span className="text-gold" aria-hidden="true">
              {icon}
            </span>
          ) : null}
        </div>
      ) : null}
      {value ? (
        <p className="font-heading text-3xl font-bold tracking-tight text-ink">{value}</p>
      ) : null}
      {caption ? <p className="text-xs text-mist">{caption}</p> : null}
      {children}
    </motion.div>
  );
}
