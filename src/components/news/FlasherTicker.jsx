'use client';

import React, { useRef } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlasherTickerDuration } from '@/hooks/useFlasherTickerDuration';

export default function FlasherTicker({ flashers, lang, tickerTiming, className }) {
  const trackRef = useRef(null);
  const durationSec = useFlasherTickerDuration(trackRef, flashers, tickerTiming);

  if (!flashers || flashers.length === 0) return null;

  const label = lang === 'he' ? 'מבזקים' : lang === 'ar' ? 'عاجל' : 'Breaking';

  return (
    <div
      className={cn(
        'mt-3 flex min-h-0 flex-1 flex-col border-t border-border pt-3',
        className,
      )}
    >
      <div className="mb-2 flex w-fit shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
        <Zap className="h-3 w-3" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative min-h-20 flex-1 overflow-hidden">
        <div
          ref={trackRef}
          className="animate-ticker-vertical absolute inset-x-0 top-0 w-full"
          style={{ animationDuration: `${durationSec}s` }}
        >
          {[...flashers, ...flashers].map((flash, i) => (
            <p key={i} className="text-xs text-muted-foreground py-1 leading-snug font-bold">
              <span className="text-destructive/60 mr-1.5">●</span>
              {flash}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
