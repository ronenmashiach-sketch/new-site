'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS } from '@/lib/admin-nav';

/**
 * @param {{ className?: string; onNavigate?: () => void }} props
 */
export function AdminNavLinks({ className, onNavigate }) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="ניווט ניהול">
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || (pathname != null && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
