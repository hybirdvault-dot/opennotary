/**
 * The OpenNotary brand motif: a notary seal drawn as concentric rings with
 * radial ticks and a central star. Used as the logo, hero watermark, success
 * stamp frame and loading spinner across the app.
 */
import { cn } from '@/lib/utils';

export type SealTone = 'gold' | 'emerald' | 'wax' | 'mist';

const TONE_COLOR: Record<SealTone, string> = {
  gold: '#C8A968',
  emerald: '#10B981',
  wax: '#B8463F',
  mist: '#9CA3AF',
};

export interface NotarySealProps {
  /** Rendered pixel size of the square SVG. */
  size?: number;
  /** Stroke colorway of the seal. */
  tone?: SealTone;
  /** Slow continuous rotation (hero watermark / loading use). */
  spinning?: boolean;
  className?: string;
}

const TICK_DEGREES = Array.from({ length: 36 }, (_, index) => index * 10);

export function NotarySeal({
  size = 64,
  tone = 'gold',
  spinning = false,
  className,
}: NotarySealProps) {
  const stroke = TONE_COLOR[tone];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="OpenNotary seal"
      className={cn(spinning && 'animate-spin [animation-duration:32s]', className)}
    >
      <g stroke={stroke} fill="none" strokeLinecap="round">
        <circle cx="50" cy="50" r="47" strokeWidth="2.5" opacity="0.9" />
        <circle cx="50" cy="50" r="39" strokeWidth="1.2" opacity="0.55" />
        {TICK_DEGREES.map((deg) => (
          <line
            key={deg}
            x1="50"
            y1="3.5"
            x2="50"
            y2="8.5"
            strokeWidth="1.6"
            opacity="0.65"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="30" strokeWidth="1.8" opacity="0.8" />
        <path
          d="M50 30 L55 45 L70 50 L55 55 L50 70 L45 55 L30 50 L45 45 Z"
          fill={stroke}
          stroke="none"
          opacity="0.95"
        />
        <circle cx="50" cy="50" r="7" strokeWidth="1.2" opacity="0.9" />
      </g>
    </svg>
  );
}
