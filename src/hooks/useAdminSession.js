'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * @returns {{ user: string | null, checking: boolean, refresh: () => Promise<void> }}
 */
export function useAdminSession() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data?.username) {
        setUser(data.username);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, checking, refresh };
}
