export const DEFAULT_MAX_FLASHERS_DISPLAY = 15;
export const MIN_MAX_FLASHERS_DISPLAY = 1;
export const MAX_MAX_FLASHERS_DISPLAY = 50;

/** @param {unknown} value */
export function clampMaxFlashersDisplay(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < MIN_MAX_FLASHERS_DISPLAY) return MIN_MAX_FLASHERS_DISPLAY;
  if (i > MAX_MAX_FLASHERS_DISPLAY) return MAX_MAX_FLASHERS_DISPLAY;
  return i;
}

/** @param {unknown[]} flashers @param {unknown} maxDisplay */
export function limitFlashersForDisplay(flashers, maxDisplay) {
  if (!Array.isArray(flashers)) return [];
  const max = clampMaxFlashersDisplay(maxDisplay) ?? DEFAULT_MAX_FLASHERS_DISPLAY;
  return flashers.slice(0, max);
}
