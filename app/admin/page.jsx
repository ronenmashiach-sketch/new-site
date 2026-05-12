'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminSession } from '@/hooks/useAdminSession';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminPage() {
  const router = useRouter();
  const { user, checking, refresh } = useAdminSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!checking && user) {
      router.replace('/admin/dashboard');
    }
  }, [checking, user, router]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'ההתחברות נכשלה.');
        return;
      }
      setPassword('');
      await refresh();
      router.replace('/admin/dashboard');
    } catch {
      setError('אירעה שגיאה. נסו שוב בעוד רגע.');
    } finally {
      setLoading(false);
    }
  }

  if (checking || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <p className="text-muted-foreground">טוען…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">כניסת מנהלים</CardTitle>
          <CardDescription>הזינו שם משתמש וסיסמה כפי שהוגדרו בקובץ הסביבה של השרת</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="admin-user">שם משתמש</Label>
              <Input
                id="admin-user"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-pass">סיסמה</Label>
              <Input
                id="admin-pass"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="text-right"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2 border-t bg-muted/20 py-4 sm:flex-row sm:justify-between">
            <Button type="submit" className="w-full sm:w-auto" disabled={loading}>
              {loading ? 'מתחברים…' : 'התחברות'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
