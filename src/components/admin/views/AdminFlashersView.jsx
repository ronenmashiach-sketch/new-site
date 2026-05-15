'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFlasherTickerDuration } from '@/hooks/useFlasherTickerDuration';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  DEFAULT_MAX_FLASHERS_DISPLAY,
  limitFlashersForDisplay,
  MAX_MAX_FLASHERS_DISPLAY,
  MIN_MAX_FLASHERS_DISPLAY,
} from '@/lib/flasher-ticker-display';
import {
  DEFAULT_FLASHER_SPEED_LEVEL,
  MAX_FLASHER_SPEED_LEVEL,
  speedLevelLabelHe,
  speedLevelToTiming,
} from '@/lib/flasher-ticker-duration';

const PREVIEW_FLASHERS = [
  'מבזק ראשון לדוגמה — עדכון חשוב מהשטח',
  'מבזק שני: פיתוח נוסף בנושא',
  'מבזק שלישי: סיכום קצר לצופים',
  'מבזק רביעי: המשך מעקב',
  'מבזק חמישי: המשך מעקב',
  'מבזק שיש: המשך מעקב',
  'מבזק שביעי: המשך מעקב',
  'מבזק שמיני: המשך מעקב',
  'מבזק תשיעי: המשך מעקב',
  'מבזק עשירי: המשך מעקב',
  'מבזק שנים עשר: המשך מעקב',
  'מבזק שלוש עשר: המשך מעקב',
  'מבזק ארבע עשר: המשך מעקב',
  'מבזק חמש עשר: המשך מעקב',
  'מבזק שיש עשר: המשך מעקב',
  'מבזק שבע עשר: המשך מעקב',
  'מבזק שמינ עשר: המשך מעקב',
];

async function fetchSettings(signal) {
  const res = await fetch('/api/flasher-ticker-settings', { cache: 'no-store', signal });
  if (!res.ok) throw new Error('fetch_failed');
  return res.json();
}

function TickerPreview({ speedLevel, maxFlashersDisplay }) {
  const trackRef = useRef(null);
  const timing = useMemo(() => speedLevelToTiming(speedLevel), [speedLevel]);
  const previewFlashers = useMemo(
    () => limitFlashersForDisplay(PREVIEW_FLASHERS, maxFlashersDisplay),
    [maxFlashersDisplay],
  );
  const durationSec = useFlasherTickerDuration(trackRef, previewFlashers, timing);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="mb-3 text-xs font-medium text-muted-foreground">תצוגה מקדימה</p>
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex w-fit items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
          <Zap className="h-3 w-3" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wider">מבזקים</span>
        </div>
        <div className="relative h-20 overflow-hidden">
          <div
            ref={trackRef}
            className="animate-ticker-vertical absolute w-full"
            style={{ animationDuration: `${durationSec}s` }}
          >
            {[...previewFlashers, ...previewFlashers].map((text, i) => (
              <p key={i} className="py-1 text-xs font-bold leading-snug text-muted-foreground">
                <span className="mr-1.5 text-destructive/60">●</span>
                {text}
              </p>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          כ־{timing.secPerRow} שניות לשורת טקסט בגובה סטנדרטי · מחזור לפי גובה בפועל: כ־
          {Math.round(durationSec)} שניות
        </p>
      </div>
    </div>
  );
}

export function AdminFlashersView() {
  const [speedLevel, setSpeedLevel] = useState(DEFAULT_FLASHER_SPEED_LEVEL);
  const [savedLevel, setSavedLevel] = useState(DEFAULT_FLASHER_SPEED_LEVEL);
  const [maxFlashersDisplay, setMaxFlashersDisplay] = useState(DEFAULT_MAX_FLASHERS_DISPLAY);
  const [savedMaxFlashers, setSavedMaxFlashers] = useState(DEFAULT_MAX_FLASHERS_DISPLAY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const timing = useMemo(() => speedLevelToTiming(speedLevel), [speedLevel]);
  const dirty = speedLevel !== savedLevel || maxFlashersDisplay !== savedMaxFlashers;

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const data = await fetchSettings(ac.signal);
        if (ac.signal.aborted) return;
        const level = Number(data?.speedLevel);
        const next = Number.isFinite(level)
          ? Math.min(MAX_FLASHER_SPEED_LEVEL, Math.max(1, Math.trunc(level)))
          : DEFAULT_FLASHER_SPEED_LEVEL;
        setSpeedLevel(next);
        setSavedLevel(next);
        const max = Number(data?.maxFlashersDisplay);
        const maxNext = Number.isFinite(max)
          ? Math.min(MAX_MAX_FLASHERS_DISPLAY, Math.max(MIN_MAX_FLASHERS_DISPLAY, Math.trunc(max)))
          : DEFAULT_MAX_FLASHERS_DISPLAY;
        setMaxFlashersDisplay(maxNext);
        setSavedMaxFlashers(maxNext);
      } catch {
        if (ac.signal.aborted) return;
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, []);

  const onSave = useCallback(async () => {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/flasher-ticker-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ speedLevel, maxFlashersDisplay }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(typeof data?.message === 'string' ? data.message : 'השמירה נכשלה.');
        return;
      }
      const level = Number(data?.speedLevel);
      const next = Number.isFinite(level) ? Math.trunc(level) : speedLevel;
      setSpeedLevel(next);
      setSavedLevel(next);
      const max = Number(data?.maxFlashersDisplay);
      const maxNext = Number.isFinite(max) ? Math.trunc(max) : maxFlashersDisplay;
      setMaxFlashersDisplay(maxNext);
      setSavedMaxFlashers(maxNext);
      setNotice('הגדרות המבזקים נשמרו. רעננו את דף הבית כדי לראות את השינוי.');
    } catch {
      setError('שגיאת רשת בשמירה.');
    } finally {
      setSaving(false);
    }
  }, [speedLevel, maxFlashersDisplay]);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">מבזקים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          שליטה במהירות הגלילה של רשימת המבזקים בכרטיסי החדשות בדף הבית.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">מהירות גלילה</CardTitle>
          <CardDescription>
            1 = איטי מאוד · 10 = רגיל · 20 = הכי מהיר. מהירות אחידה לפי גובה תוכן (גם כשהשורות ארוכות או רבות).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="flasher-speed">מהירות נוכחית</Label>
              <span className="text-sm font-semibold tabular-nums">
                {speedLevel} — {speedLevelLabelHe(speedLevel)}
              </span>
            </div>
            <Slider
              id="flasher-speed"
              min={1}
              max={MAX_FLASHER_SPEED_LEVEL}
              step={1}
              disabled={loading || saving}
              value={[speedLevel]}
              onValueChange={([v]) => setSpeedLevel(v)}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>מהיר</span>
              <span>איטי</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-center text-xs">
            <div>
              <p className="text-muted-foreground">שניות לכל שורה</p>
              <p className="font-mono text-lg font-semibold">{timing.secPerRow} ש׳</p>
            </div>
            <div>
              <p className="text-muted-foreground">חישוב</p>
              <p className="text-sm font-medium leading-snug">לפי גובה DOM בפועל</p>
            </div>
          </div>

          <TickerPreview speedLevel={speedLevel} maxFlashersDisplay={maxFlashersDisplay} />

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">כמות מקסימלית</CardTitle>
          <CardDescription>
            כמה מבזקים להציג בכל כרטיס (מתוך כל מה שנשלף מהמקור). טווח: {MIN_MAX_FLASHERS_DISPLAY}–
            {MAX_MAX_FLASHERS_DISPLAY}. ברירת מחדל: {DEFAULT_MAX_FLASHERS_DISPLAY}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max-flashers">מקסימום מבזקים בכרטיס</Label>
            <Input
              id="max-flashers"
              type="number"
              min={MIN_MAX_FLASHERS_DISPLAY}
              max={MAX_MAX_FLASHERS_DISPLAY}
              step={1}
              disabled={loading || saving}
              value={maxFlashersDisplay}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isNaN(n)) return;
                setMaxFlashersDisplay(
                  Math.min(MAX_MAX_FLASHERS_DISPLAY, Math.max(MIN_MAX_FLASHERS_DISPLAY, n)),
                );
              }}
              className="font-mono"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              בתצוגה מקדימה: {limitFlashersForDisplay(PREVIEW_FLASHERS, maxFlashersDisplay).length}{' '}
              מתוך {PREVIEW_FLASHERS.length} לדוגמה
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-green-600 dark:text-green-400">{notice}</p> : null}

      <Button type="button" className="w-full" disabled={loading || saving || !dirty} onClick={onSave}>
        {saving ? 'שומרים…' : 'שמירה'}
      </Button>
    </div>
  );
}
