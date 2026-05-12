'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession } from '@/hooks/useAdminSession';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function AdminSessionGate({ children }) {
  const router = useRouter();
  const { user, checking, refresh } = useAdminSession();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!checking && !user) {
      router.replace('/admin');
    }
  }, [checking, user, router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
      await refresh();
      router.replace('/admin');
    } finally {
      setLoggingOut(false);
    }
  }

  if (checking || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-muted-foreground">טוען…</p>
      </div>
    );
  }

  return (
    <AdminShell username={user} onLogout={handleLogout} loggingOut={loggingOut}>
      {children}
    </AdminShell>
  );
}
