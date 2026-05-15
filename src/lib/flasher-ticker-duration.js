/** @typedef {{ secPerRow: number, minDurationSec: number, maxDurationSec: number }} FlasherTickerTiming */

export const MIN_FLASHER_SPEED_LEVEL = 1;
export const MAX_FLASHER_SPEED_LEVEL = 20;
export const DEFAULT_FLASHER_SPEED_LEVEL = 4;

/** @type {FlasherTickerTiming} */
const SLOW_TIMING = { secPerRow: 5.5, minDurationSec: 22, maxDurationSec: 180 };

/** @type {FlasherTickerTiming} */
const MID_TIMING = { secPerRow: 2.5, minDurationSec: 12, maxDurationSec: 120 };

/** @type {FlasherTickerTiming} */
const ULTRA_FAST_TIMING = { secPerRow: 0.5, minDurationSec: 6, maxDurationSec: 40 };

/** גובה שורה יחידה (text-xs + py-1) — בסיס לחישוב מהירות פיקסלים */
export const REFERENCE_ROW_HEIGHT_PX = 22;

/** @param {number} value @param {number} min @param {number} max */
function clampInt(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** @param {FlasherTickerTiming} a @param {FlasherTickerTiming} b @param {number} t 0..1 */
function lerpTiming(a, b, t) {
  return {
    secPerRow: Math.round((a.secPerRow + (b.secPerRow - a.secPerRow) * t) * 10) / 10,
    minDurationSec: Math.round(a.minDurationSec + (b.minDurationSec - a.minDurationSec) * t),
    maxDurationSec: Math.round(a.maxDurationSec + (b.maxDurationSec - a.maxDurationSec) * t),
  };
}

/** @param {unknown} speedLevel 1 (איטי) … 20 (הכי מהיר); 10 ≈ רגיל */
export function speedLevelToTiming(speedLevel) {
  const level =
    clampInt(speedLevel, MIN_FLASHER_SPEED_LEVEL, MAX_FLASHER_SPEED_LEVEL) ??
    DEFAULT_FLASHER_SPEED_LEVEL;
  if (level <= 10) {
    const t = (level - 1) / 9;
    return lerpTiming(SLOW_TIMING, MID_TIMING, t);
  }
  const t = (level - 10) / 10;
  return lerpTiming(MID_TIMING, ULTRA_FAST_TIMING, t);
}

function clampDuration(raw, timing) {
  const min = timing?.minDurationSec;
  const max = timing?.maxDurationSec;
  const lo = Number.isFinite(min) && min > 0 ? min : raw;
  const hi = Number.isFinite(max) && max > 0 ? max : raw;
  return Math.min(hi, Math.max(lo, raw));
}

/**
 * משך מחזור לפי גובה תוכן אמיתי (כולל שורות מרובות שורות).
 * האנימציה זזה 50% מהגובה → מרחק מחזור = scrollHeight / 2.
 */
export function computeTickerDurationFromScrollHeight(scrollHeightPx, timing) {
  const secPerRow = timing?.secPerRow;
  if (!Number.isFinite(secPerRow) || secPerRow <= 0) {
    const legacyCycle = timing?.cycleDurationSec;
    if (Number.isFinite(legacyCycle) && legacyCycle > 0) return legacyCycle;
    return MID_TIMING.minDurationSec;
  }

  const h = Number(scrollHeightPx) || 0;
  if (h <= 0) return timing?.minDurationSec ?? MID_TIMING.minDurationSec;

  const cycleDistancePx = h / 2;
  const pixelsPerSec = REFERENCE_ROW_HEIGHT_PX / secPerRow;
  const raw = cycleDistancePx / pixelsPerSec;
  return clampDuration(raw, timing);
}

/** הערכה לפי כמות שורות — עד שמודדים גובה ב-DOM */
export function computeTickerDurationSec(flashersCount, timing) {
  const n = Math.max(0, Number(flashersCount) || 0);
  const secPerRow = timing?.secPerRow;
  if (Number.isFinite(secPerRow) && secPerRow > 0) {
    const raw = n > 0 ? n * secPerRow : timing?.minDurationSec;
    return clampDuration(raw, timing);
  }
  const legacyCycle = timing?.cycleDurationSec;
  if (Number.isFinite(legacyCycle) && legacyCycle > 0) return legacyCycle;
  return MID_TIMING.minDurationSec;
}

/** @param {number} speedLevel */
export function speedLevelLabelHe(speedLevel) {
  const level =
    clampInt(speedLevel, MIN_FLASHER_SPEED_LEVEL, MAX_FLASHER_SPEED_LEVEL) ??
    DEFAULT_FLASHER_SPEED_LEVEL;
  if (level <= 4) return 'איטי מאוד';
  if (level <= 8) return 'איטי';
  if (level <= 12) return 'רגיל';
  if (level <= 16) return 'מהיר';
  return 'מהיר מאוד';
}
