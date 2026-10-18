/**
 * Compact notary identity badge: seal dot + truncated address in mono, an
 * optional jurisdiction code, and a colored commission-status pill.
 */
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

import { truncateMiddle } from './encoding';

export type NotaryStatus = 'active' | 'expired' | 'revoked' | 'pending';

export interface NotaryBadgeProps {
  /** Notary wallet address. */
  address: string;
  /** Commission status pill. */
  status?: NotaryStatus;
  /** Optional 2-4 char jurisdiction code. */
  stateCode?: string;
  className?: string;
}

const STATUS_META: Record<
  NotaryStatus,
  { label: string; pillClassName: string; iconClassName: string; icon: typeof ShieldCheck }
> = {
  active: {
    label: 'Commissioned',
    pillClassName: 'border-success/40 bg-success/10 text-success',
    iconClassName: 'text-success',
    icon: ShieldCheck,
  },
  expired: {
    label: 'Expired',
    pillClassName: 'border-gold/40 bg-gold/10 text-gold',
    iconClassName: 'text-gold',
    icon: ShieldAlert,
  },
  revoked: {
    label: 'Revoked',
    pillClassName: 'border-wax/40 bg-wax/10 text-wax',
    iconClassName: 'text-wax',
    icon: ShieldX,
  },
  pending: {
    label: 'Pending',
    pillClassName: 'border-white/20 bg-white/5 text-mist',
    iconClassName: 'text-mist',
    icon: ShieldQuestion,
  },
};

export function NotaryBadge({ address, status = 'active', stateCode, className }: NotaryBadgeProps) {
  const meta = STATUS_META[status];
  const StatusIcon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pr-3 pl-2',
        className,
      )}
    >
      <StatusIcon className={cn('size-4', meta.iconClassName)} aria-hidden="true" />
      <span className="hash-text text-xs text-ink">{truncateMiddle(address, 6, 4)}</span>
      {stateCode ? (
        <span className="rounded-full border border-white/10 px-1.5 text-[10px] font-medium tracking-wider text-mist uppercase">
          {stateCode}
        </span>
      ) : null}
      <span
        className={cn(
          'rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
          meta.pillClassName,
        )}
      >
        {meta.label}
      </span>
    </span>
  );
}
