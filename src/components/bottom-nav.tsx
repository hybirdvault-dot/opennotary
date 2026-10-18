'use client';

/**
 * Mobile-first bottom navigation (56px, gold underline on the active item).
 * Hidden on large screens where the top header carries navigation.
 */
import { FileSignature, Home, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/notarize', label: 'Notarize', icon: FileSignature },
  { href: '/verify', label: 'Verify', icon: Search },
  { href: '/notary/dashboard', label: 'Profile', icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy/90 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-lg items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 transition-colors',
                  active ? 'text-gold' : 'text-mist hover:text-ink',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="text-[10px] font-medium">{label}</span>
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-gold"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
