'use client';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminMobileNav } from '@/components/admin/AdminMobileNav';
import { Button } from '@/components/ui/button';

/**
 * @param {{
 *   username: string;
 *   children: import('react').ReactNode;
 *   onLogout: () => void | Promise<void>;
 *   loggingOut?: boolean;
 * }} props
 */
export function AdminShell({ username, children, onLogout, loggingOut }) {
  const footer = (
    <Button type="button" variant="outline" className="w-full" disabled={loggingOut} onClick={onLogout}>
      {loggingOut ? 'מתנתקים…' : 'התנתקות'}
    </Button>
  );

  return (
    <div className="flex min-h-dvh w-full flex-row">
      <AdminSidebar
        username={username}
        footer={footer}
        className="sticky top-0 hidden h-dvh w-56 shrink-0 border-l border-border/80 lg:block"
      />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <AdminMobileNav footer={footer} />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-semibold">אזור ניהול</p>
            <p className="truncate text-xs text-muted-foreground">{username}</p>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
