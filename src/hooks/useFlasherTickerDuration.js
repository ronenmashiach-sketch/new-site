'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import {
  computeTickerDurationFromScrollHeight,
  computeTickerDurationSec,
} from '@/lib/flasher-ticker-duration';

/**
 * @param {import('react').RefObject<HTMLElement | null>} trackRef
 * @param {unknown[]} flashers
 * @param {import('@/lib/flasher-ticker-duration').FlasherTickerTiming | undefined} tickerTiming
 */
export function useFlasherTickerDuration(trackRef, flashers, tickerTiming) {
  const [durationSec, setDurationSec] = useState(() =>
    computeTickerDurationSec(flashers?.length ?? 0, tickerTiming),
  );

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const h = el.scrollHeight;
    if (h > 0) {
      setDurationSec(computeTickerDurationFromScrollHeight(h, tickerTiming));
    }
  }, [trackRef, tickerTiming]);

  useLayoutEffect(() => {
    measure();
  }, [measure, flashers, tickerTiming]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, trackRef]);

  return durationSec;
}
