import { resolveSiteFontStack } from '@/lib/site-font-options';

/** @param {{ text: string, fontSizePx: number, fontWeight: number, color: string, useGradient?: boolean, gradientFrom?: string, gradientTo?: string, letterSpacingPx?: number, fontFamily?: string }} title */
export function legacySiteTitleToHtml(title) {
  const text = title.text || 'BaSaD';
  const family = resolveSiteFontStack(title.fontFamily);
  const base = `font-family:${family};font-size:${title.fontSizePx}px;font-weight:${title.fontWeight};letter-spacing:${title.letterSpacingPx ?? 0}px;`;
  if (title.useGradient && title.gradientFrom && title.gradientTo) {
    return `<p><span style="${base}background:linear-gradient(90deg,${title.gradientFrom},${title.gradientTo});-webkit-background-clip:text;background-clip:text;color:transparent;">${escapeHtml(text)}</span></p>`;
  }
  return `<p><span style="${base}color:${title.color};">${escapeHtml(text)}</span></p>`;
}

/** @param {{ text: string, fontSizePx: number, fontWeight: number, color: string, fontFamily?: string }} subtitle */
export function legacySiteSubtitleToHtml(subtitle) {
  if (!subtitle.text?.trim()) return '';
  const family = resolveSiteFontStack(subtitle.fontFamily);
  return `<p><span style="font-family:${family};font-size:${subtitle.fontSizePx}px;font-weight:${subtitle.fontWeight};color:${subtitle.color};">${escapeHtml(subtitle.text)}</span></p>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const DEFAULT_SITE_TITLE_HTML =
  '<p><strong style="font-size: 36px; font-weight: 800;">BaSaD</strong></p>';

export const DEFAULT_SITE_SUBTITLE_HTML =
  '<p><span style="font-size: 14px; color: #64748b;">Breaking Story Daily</span></p>';
