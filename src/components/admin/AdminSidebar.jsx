'use client';

import { AdminNavLinks } from '@/components/admin/AdminNavLinks';

/**
 * @param {{ footer?: import('react').ReactNode; className?: string; username?: string }} props
 */
export function AdminSidebar({ footer, className, username }) {
  return (
    <aside
      className={className}
      aria-label="תפריט ניהול"
    >
      <div className="flex h-full min-h-0 flex-col border-border/80 bg-muted/30">
        <div className="border-b border-border/60 px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">תפריט</p>
          {username ? (
            <p className="mt-1 truncate text-sm font-medium text-foreground" title={username}>
              {username}
            </p>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <AdminNavLinks />
        </div>
        {footer ? <div className="border-t border-border/60 p-3">{footer}</div> : null}
      </div>
    </aside>
  );
}
