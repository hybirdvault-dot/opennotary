/**
 * Consistent section heading: gold eyebrow, Plus Jakarta Sans title and a
 * muted subtitle — used by every page section.
 */
import { cn } from '@/lib/utils';

export interface SectionHeadingProps {
  /** Small uppercase gold eyebrow above the title. */
  eyebrow?: string;
  /** Section title (rendered in the heading font). */
  title: string;
  /** Optional muted supporting line. */
  subtitle?: string;
  /** Center-align the block (default) or left-align. */
  align?: 'center' | 'left';
  /**
   * Heading level: `h1` for the one page-level heading, `h2` (default) for
   * in-page sections — keeps exactly one `h1` per page.
   */
  as?: 'h1' | 'h2';
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  as: Heading = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.22em] text-gold uppercase">{eyebrow}</p>
      ) : null}
      <Heading className="font-heading text-3xl font-bold text-ink sm:text-4xl">{title}</Heading>
      {subtitle ? <p className="max-w-2xl text-base text-mist sm:text-lg">{subtitle}</p> : null}
    </div>
  );
}
