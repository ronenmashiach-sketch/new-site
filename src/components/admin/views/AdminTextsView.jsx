'use client';

import { useCallback, useEffect, useState } from 'react';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DEFAULT_SITE_SUBTITLE_HTML,
  DEFAULT_SITE_TITLE_HTML,
} from '@/lib/site-title-html';
import {
  buildSiteSubtitleRichWrapper,
  buildSiteTitleRichWrapper,
  DEFAULT_SITE_SUBTITLE_DISPLAY,
  DEFAULT_SITE_TITLE_DISPLAY,
} from '@/lib/siteTitleBranding';

async function fetchBranding(signal) {
  const res = await fetch('/api/site-branding', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

function ColorField({ id, label, value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 shrink-0 cursor-pointer p-1"
        />
        <Input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          dir="ltr"
        />
      </div>
    </div>
  );
}

function RichPreview({ titleHtml, subtitleHtml, siteTitle, siteSubtitle }) {
  const hasSubtitle = Boolean(subtitleHtml?.replace(/<[^>]+>/g, '').trim());
  const titleWrap = buildSiteTitleRichWrapper(siteTitle);
  const subtitleWrap = buildSiteSubtitleRichWrapper(siteSubtitle);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
      <p className="mb-3 text-xs font-medium text-muted-foreground">תצוגה מקדימה</p>
      <div
        className={titleWrap.className}
        style={titleWrap.style}
        dangerouslySetInnerHTML={{ __html: titleHtml || '<p>—</p>' }}
      />
      {hasSubtitle ? (
        <div
          className={subtitleWrap.className}
          style={subtitleWrap.style}
          dangerouslySetInnerHTML={{ __html: subtitleHtml }}
        />
      ) : null}
    </div>
  );
}

export function AdminTextsView() {
  const [siteTitleHtml, setSiteTitleHtml] = useState(DEFAULT_SITE_TITLE_HTML);
  const [siteSubtitleHtml, setSiteSubtitleHtml] = useState(DEFAULT_SITE_SUBTITLE_HTML);
  const [siteTitle, setSiteTitle] = useState(DEFAULT_SITE_TITLE_DISPLAY);
  const [siteSubtitle, setSiteSubtitle] = useState(DEFAULT_SITE_SUBTITLE_DISPLAY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const applyBranding = useCallback((data) => {
    if (typeof data?.siteTitleHtml === 'string') setSiteTitleHtml(data.siteTitleHtml);
    if (typeof data?.siteSubtitleHtml === 'string') setSiteSubtitleHtml(data.siteSubtitleHtml);
    if (data?.siteTitle && typeof data.siteTitle === 'object') {
      setSiteTitle({ ...DEFAULT_SITE_TITLE_DISPLAY, ...data.siteTitle });
    }
    if (data?.siteSubtitle && typeof data.siteSubtitle === 'object') {
      setSiteSubtitle({ ...DEFAULT_SITE_SUBTITLE_DISPLAY, ...data.siteSubtitle });
    }
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchBranding();
      applyBranding(data);
    } catch {
      setError('לא ניתן לטעון את ההגדרות.');
    }
  }, [applyBranding]);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await fetchBranding(ac.signal);
        if (ac.signal.aborted) return;
        applyBranding(data);
      } catch {
        if (!ac.signal.aborted) setError('לא ניתן לטעון את ההגדרות.');
      }
    })();
    return () => ac.abort();
  }, [applyBranding]);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/site-branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          siteTitleHtml,
          siteSubtitleHtml,
          siteTitle: {
            useGradient: siteTitle.useGradient,
            gradientFrom: siteTitle.gradientFrom,
            gradientTo: siteTitle.gradientTo,
            letterSpacingPx: siteTitle.letterSpacingPx,
          },
          siteSubtitle: {
            useGradient: siteSubtitle.useGradient,
            gradientFrom: siteSubtitle.gradientFrom,
            gradientTo: siteSubtitle.gradientTo,
            letterSpacingPx: siteSubtitle.letterSpacingPx,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'השמירה נכשלה.');
        return;
      }
      applyBranding(data);
      setNotice('שם האתר והעיצוב נשמרו.');
    } catch {
      setError('אירעה שגיאת רשת. נסו שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">שם ועיצוב האתר</h1>
        <p className="text-sm text-muted-foreground">
          עורך עשיר לעיצוב אות־אות, ובנוסף גרדיאן וריווח על כל השם או כותרת המשנה. ריווח עובד יחד עם
          העורך; גרדיאן חל על כל השורה (צבעים מהעורך על מילה בודדת עלולים לא להופיע כשהגרדיאן פעיל).
        </p>
      </div>

      <RichPreview
        titleHtml={siteTitleHtml}
        subtitleHtml={siteSubtitleHtml}
        siteTitle={siteTitle}
        siteSubtitle={siteSubtitle}
      />

      <form onSubmit={onSave} className="space-y-6">
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

        <Card>
          <CardHeader>
            <CardTitle>שם האתר</CardTitle>
            <CardDescription>סמנו טקסט → עיצוב בסרגל הכלים</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RichTextEditor
              value={siteTitleHtml}
              onChange={setSiteTitleHtml}
              disabled={saving}
              minHeight={140}
              placeholder="שם האתר…"
            />

            <div className="space-y-2">
              <Label htmlFor="site-title-spacing">ריווח אותיות (px)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="site-title-spacing"
                  type="range"
                  min={-2}
                  max={8}
                  step={0.5}
                  value={siteTitle.letterSpacingPx}
                  disabled={saving}
                  onChange={(e) =>
                    setSiteTitle((t) => ({ ...t, letterSpacingPx: Number(e.target.value) }))
                  }
                  className="w-full"
                />
                <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                  {siteTitle.letterSpacingPx}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="site-title-gradient">גרדיאן בצבע הטקסט</Label>
                <p className="text-xs text-muted-foreground">על כל שם האתר</p>
              </div>
              <Switch
                id="site-title-gradient"
                checked={siteTitle.useGradient}
                disabled={saving}
                onCheckedChange={(checked) =>
                  setSiteTitle((t) => ({ ...t, useGradient: checked }))
                }
              />
            </div>

            {siteTitle.useGradient ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  id="site-title-grad-from"
                  label="צבע התחלה"
                  value={siteTitle.gradientFrom}
                  disabled={saving}
                  onChange={(v) => setSiteTitle((t) => ({ ...t, gradientFrom: v }))}
                />
                <ColorField
                  id="site-title-grad-to"
                  label="צבע סיום"
                  value={siteTitle.gradientTo}
                  disabled={saving}
                  onChange={(v) => setSiteTitle((t) => ({ ...t, gradientTo: v }))}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>כותרת משנה</CardTitle>
            <CardDescription>ריק = לא מוצגת</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RichTextEditor
              value={siteSubtitleHtml}
              onChange={setSiteSubtitleHtml}
              disabled={saving}
              minHeight={100}
              placeholder="כותרת משנה (אופציונלי)…"
            />

            <div className="space-y-2">
              <Label htmlFor="site-subtitle-spacing">ריווח אותיות (px)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="site-subtitle-spacing"
                  type="range"
                  min={-2}
                  max={8}
                  step={0.5}
                  value={siteSubtitle.letterSpacingPx}
                  disabled={saving}
                  onChange={(e) =>
                    setSiteSubtitle((s) => ({ ...s, letterSpacingPx: Number(e.target.value) }))
                  }
                  className="w-full"
                />
                <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                  {siteSubtitle.letterSpacingPx}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="site-subtitle-gradient">גרדיאן בצבע הטקסט</Label>
                <p className="text-xs text-muted-foreground">על כל כותרת המשנה</p>
              </div>
              <Switch
                id="site-subtitle-gradient"
                checked={siteSubtitle.useGradient}
                disabled={saving}
                onCheckedChange={(checked) =>
                  setSiteSubtitle((s) => ({ ...s, useGradient: checked }))
                }
              />
            </div>

            {siteSubtitle.useGradient ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  id="site-subtitle-grad-from"
                  label="צבע התחלה"
                  value={siteSubtitle.gradientFrom}
                  disabled={saving}
                  onChange={(v) => setSiteSubtitle((s) => ({ ...s, gradientFrom: v }))}
                />
                <ColorField
                  id="site-subtitle-grad-to"
                  label="צבע סיום"
                  value={siteSubtitle.gradientTo}
                  disabled={saving}
                  onChange={(v) => setSiteSubtitle((s) => ({ ...s, gradientTo: v }))}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'שומרים…' : 'שמירה'}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => load()}>
            טעינה מחדש
          </Button>
        </div>
      </form>
    </div>
  );
}
