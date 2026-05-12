'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminNavLinks } from '@/components/admin/AdminNavLinks';

/**
 * @param {{ footer?: import('react').ReactNode }} props
 */
export function AdminMobileNav({ footer }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="פתיחת תפריט"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-[min(100%,20rem)] flex-col p-0">
          <SheetHeader className="border-b border-border/60 px-6 py-4 text-right">
            <SheetTitle className="text-base">תפריט ניהול</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <AdminNavLinks onNavigate={() => setOpen(false)} />
          </div>
          {footer ? <div className="border-t border-border/60 p-4">{footer}</div> : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
