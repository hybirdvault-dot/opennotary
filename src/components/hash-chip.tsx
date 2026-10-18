'use client';

/**
 * Mono-font hash chip with copy-to-clipboard and optional external explorer
 * link. Used everywhere a bytes32/tx/address/UID is displayed.
 */
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { truncateMiddle } from './encoding';

export interface HashChipProps {
  /** Full hex value to display (truncated) and copy. */
  value: string;
  /** Optional small uppercase label rendered before the value. */
  label?: string;
  /** Optional explorer URL; renders the value as an external link. */
  href?: string;
  /** Leading characters kept when truncating. */
  lead?: number;
  /** Trailing characters kept when truncating. */
  tail?: number;
  className?: string;
}

export function HashChip({
  value,
  label,
  href,
  lead = 6,
  tail = 4,
  className,
}: HashChipProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied to clipboard');
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      toast.error('Could not copy — copy manually');
    }
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1',
        className,
      )}
    >
      {label ? (
        <span className="text-[10px] font-medium tracking-[0.14em] text-mist uppercase">
          {label}
        </span>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="hash-text text-xs text-ink transition-colors hover:text-gold"
          aria-label={`Open ${label ?? 'value'} on explorer`}
        >
          {truncateMiddle(value, lead, tail)}
          <ExternalLink className="ml-1 inline size-3 align-[-1px]" aria-hidden="true" />
        </a>
      ) : (
        <span className="hash-text text-xs text-ink">{truncateMiddle(value, lead, tail)}</span>
      )}
      <button
        type="button"
        onClick={copyValue}
        aria-label={`Copy ${label ?? 'hash'} to clipboard`}
        className="rounded p-1 text-mist transition-colors hover:bg-white/10 hover:text-gold"
      >
        {copied ? (
          <Check className="size-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
