'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

async function fetchLogoState(signal) {
  const res = await fetch('/api/site-logo', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

async function fetchBrandingState(signal) {
  const res = await fetch('/api/site-branding', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

export function AdminIconView() {
  const [logoUrl, setLogoUrl] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [logoSizePx, setLogoSizePx] = useState(40);
  const [savingBranding, setSavingBranding] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const data = await fetchLogoState();
      setLogoUrl(typeof data?.logoUrl === 'string' ? data.logoUrl : null);
      setUpdatedAt(typeof data?.updatedAt === 'string' ? data.updatedAt : null);
    } catch {
      setLogoUrl(null);
      setUpdatedAt(null);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await fetchLogoState(ac.signal);
        if (ac.signal.aborted) return;
        setLogoUrl(typeof data?.logoUrl === 'string' ? data.logoUrl : null);
        setUpdatedAt(typeof data?.updatedAt === 'string' ? data.updatedAt : null);
      } catch {
        if (ac.signal.aborted) return;
        setLogoUrl(null);
        setUpdatedAt(null);
      }
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await fetchBrandingState(ac.signal);
        if (ac.signal.aborted) return;
        const size = Number(data?.logoSizePx);
        setLogoSizePx(Number.isFinite(size) ? size : 40);
      } catch {
        if (ac.signal.aborted) return;
        setLogoSizePx(40);
      }
    })();
    return () => ac.abort();
  }, []);

  async function onUpload(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!file) {
      setError('בחרו קובץ תמונה להעלאה.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/api/admin/site-logo', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'ההעלאה נכשלה.');
        return;
      }
      setNotice('הלוגו והפאביקון עודכנו. הקובץ הקודם הוחלף.');
      setFile(null);
      const input = document.getElementById('admin-site-logo-file');
      if (input) input.value = '';
      await refresh();
    } catch {
      setError('אירעה שגיאת רשת. נסו שוב.');
    } finally {
      setUploading(false);
    }
  }

  const previewSrc =
    logoUrl && updatedAt ? `${logoUrl}?v=${encodeURIComponent(updatedAt)}` : logoUrl;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">לוגו האתר</h1>
        <p className="text-sm text-muted-foreground">
          הלוגו מוצג בכותרת האתר ומשמש גם כאייקון / פאביקון בדפדפן. בכל העלאה הקובץ הקודם נמחק ומוחלף.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>לוגו האתר</CardTitle>
          <CardDescription>
            PNG, JPEG, WebP, GIF או SVG — עד כ־2 מ״ב. אותו קובץ משמש לכותרת ולפאביקון.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div
              className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted"
              style={{ width: logoSizePx, height: logoSizePx }}
            >
              {previewSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewSrc}
                  alt=""
                  role="presentation"
                  className="h-full w-full object-cover"
                  decoding="async"
                />
              ) : (
                <span className="px-2 text-center text-xs text-muted-foreground">אין לוגו</span>
              )}
            </div>
            {updatedAt ? (
              <p className="text-xs text-muted-foreground">
                עודכן לאחרונה:{' '}
                {new Date(updatedAt).toLocaleString('he-IL', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-site-logo-size">גודל לוגו בכותרת (פיקסלים)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="admin-site-logo-size"
                type="range"
                min={20}
                max={96}
                step={1}
                value={logoSizePx}
                disabled={savingBranding || uploading}
                onChange={(e) => {
                  setError('');
                  setNotice('');
                  setLogoSizePx(Number(e.target.value));
                }}
                className="w-full"
              />
              <div className="text-sm text-muted-foreground shrink-0 tabular-nums">{logoSizePx}px</div>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={savingBranding || uploading}
                onClick={async () => {
                  setError('');
                  setNotice('');
                  setSavingBranding(true);
                  try {
                    const res = await fetch('/api/admin/site-branding', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'same-origin',
                      body: JSON.stringify({ logoSizePx }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data?.ok) {
                      setError(typeof data?.message === 'string' ? data.message : 'השמירה נכשלה.');
                      return;
                    }
                    const saved = Number(data?.logoSizePx);
                    setLogoSizePx(Number.isFinite(saved) ? saved : logoSizePx);
                    setNotice('הגודל נשמר.');
                  } catch {
                    setError('אירעה שגיאת רשת. נסו שוב.');
                  } finally {
                    setSavingBranding(false);
                  }
                }}
              >
                {savingBranding ? 'שומרים…' : 'שמירת גודל'}
              </Button>
            </div>
          </div>

          <form onSubmit={onUpload} className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}
            {notice ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200"
              >
                {notice}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="admin-site-logo-file">קובץ לוגו</Label>
              <Input
                id="admin-site-logo-file"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.png,.jpg,.jpeg,.webp,.gif,.svg"
                disabled={uploading}
                onChange={(e) => {
                  setError('');
                  setNotice('');
                  const f = e.target.files?.[0];
                  setFile(f ?? null);
                }}
              />
            </div>
            <Button type="submit" disabled={uploading || !file}>
              {uploading ? 'מעלים…' : 'העלאה והחלפה'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
