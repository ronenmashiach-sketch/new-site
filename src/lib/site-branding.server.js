import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SITE_FONT_FAMILY, sanitizeSiteFontFamily } from '@/lib/site-font-options';
import { isRichHtmlEmpty, sanitizeSiteHtml, stripHtmlToPlainText } from '@/lib/sanitize-site-html.server';
import {
  DEFAULT_SITE_SUBTITLE_HTML,
  DEFAULT_SITE_TITLE_HTML,
  legacySiteSubtitleToHtml,
  legacySiteTitleToHtml,
} from '@/lib/site-title-html';

const BRANDING_PATH = path.join(process.cwd(), 'data', 'site-branding.json');

/** @typedef {{ text: string, fontFamily: string, fontSizePx: number, fontWeight: number, color: string, useGradient: boolean, gradientFrom: string, gradientTo: string, letterSpacingPx: number }} SiteTitleBlock */
/** @typedef {{ text: string, fontFamily: string, fontSizePx: number, fontWeight: number, color: string, useGradient: boolean, gradientFrom: string, gradientTo: string, letterSpacingPx: number }} SiteSubtitleBlock */

/** @type {SiteTitleBlock} */
export const DEFAULT_SITE_TITLE = {
  text: 'BaSaD',
  fontFamily: DEFAULT_SITE_FONT_FAMILY,
  fontSizePx: 36,
  fontWeight: 800,
  color: '#0f172a',
  useGradient: false,
  gradientFrom: '#0f172a',
  gradientTo: '#3b82f6',
  letterSpacingPx: -0.5,
};

/** @type {SiteSubtitleBlock} */
export const DEFAULT_SITE_SUBTITLE = {
  text: 'Breaking Story Daily',
  fontFamily: DEFAULT_SITE_FONT_FAMILY,
  fontSizePx: 14,
  fontWeight: 400,
  color: '#64748b',
  useGradient: false,
  gradientFrom: '#64748b',
  gradientTo: '#3b82f6',
  letterSpacingPx: 0,
};

const DEFAULTS = {
  logoSizePx: 40,
  siteTitle: DEFAULT_SITE_TITLE,
  siteSubtitle: DEFAULT_SITE_SUBTITLE,
  siteTitleHtml: DEFAULT_SITE_TITLE_HTML,
  siteSubtitleHtml: DEFAULT_SITE_SUBTITLE_HTML,
};

const FONT_WEIGHTS = new Set([400, 500, 600, 700, 800, 900]);

function clampInt(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function clampFloat(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** @param {unknown} value */
function sanitizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const t = value.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(t) || /^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  return fallback;
}

/** @param {unknown} value @param {number} maxLen */
function sanitizeText(value, fallback, maxLen) {
  if (typeof value !== 'string') return fallback;
  const t = value.trim();
  if (!t) return fallback;
  return t.slice(0, maxLen);
}

/** @param {unknown} raw */
function normalizeSiteTitle(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const useGradient = Boolean(src.useGradient);
  return {
    text: sanitizeText(src.text, DEFAULT_SITE_TITLE.text, 120),
    fontFamily: sanitizeSiteFontFamily(src.fontFamily),
    fontSizePx: clampInt(src.fontSizePx, 16, 72) ?? DEFAULT_SITE_TITLE.fontSizePx,
    fontWeight: FONT_WEIGHTS.has(Number(src.fontWeight))
      ? Number(src.fontWeight)
      : DEFAULT_SITE_TITLE.fontWeight,
    color: sanitizeHexColor(src.color, DEFAULT_SITE_TITLE.color),
    useGradient,
    gradientFrom: sanitizeHexColor(src.gradientFrom, DEFAULT_SITE_TITLE.gradientFrom),
    gradientTo: sanitizeHexColor(src.gradientTo, DEFAULT_SITE_TITLE.gradientTo),
    letterSpacingPx:
      clampFloat(src.letterSpacingPx, -2, 8) ?? DEFAULT_SITE_TITLE.letterSpacingPx,
  };
}

/** @param {unknown} raw */
function normalizeSiteSubtitle(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const useGradient = Boolean(src.useGradient);
  return {
    text: sanitizeText(src.text, DEFAULT_SITE_SUBTITLE.text, 200),
    fontFamily: sanitizeSiteFontFamily(src.fontFamily),
    fontSizePx: clampInt(src.fontSizePx, 10, 28) ?? DEFAULT_SITE_SUBTITLE.fontSizePx,
    fontWeight: FONT_WEIGHTS.has(Number(src.fontWeight))
      ? Number(src.fontWeight)
      : DEFAULT_SITE_SUBTITLE.fontWeight,
    color: sanitizeHexColor(src.color, DEFAULT_SITE_SUBTITLE.color),
    useGradient,
    gradientFrom: sanitizeHexColor(src.gradientFrom, DEFAULT_SITE_SUBTITLE.gradientFrom),
    gradientTo: sanitizeHexColor(src.gradientTo, DEFAULT_SITE_SUBTITLE.gradientTo),
    letterSpacingPx:
      clampFloat(src.letterSpacingPx, -2, 8) ?? DEFAULT_SITE_SUBTITLE.letterSpacingPx,
  };
}

/** @param {unknown} raw @param {string} fallback @param {SiteTitleBlock} legacyTitle */
function normalizeTitleHtml(raw, fallback, legacyTitle) {
  if (typeof raw === 'string' && raw.trim() && !isRichHtmlEmpty(raw)) {
    return sanitizeSiteHtml(raw);
  }
  return legacySiteTitleToHtml(legacyTitle);
}

/** @param {unknown} raw @param {string} fallback @param {SiteSubtitleBlock} legacySubtitle */
function normalizeSubtitleHtml(raw, fallback, legacySubtitle) {
  if (typeof raw === 'string' && raw.trim() && !isRichHtmlEmpty(raw)) {
    return sanitizeSiteHtml(raw);
  }
  const fromLegacy = legacySiteSubtitleToHtml(legacySubtitle);
  return fromLegacy || fallback;
}

/** @param {Record<string, unknown>} data */
function buildBrandingFromData(data) {
  const logoSizePx = clampInt(data?.logoSizePx, 20, 96) ?? DEFAULTS.logoSizePx;
  const siteTitle = normalizeSiteTitle(data?.siteTitle);
  const siteSubtitle = normalizeSiteSubtitle(data?.siteSubtitle);
  const siteTitleHtml = normalizeTitleHtml(data?.siteTitleHtml, DEFAULT_SITE_TITLE_HTML, siteTitle);
  const siteSubtitleHtml = normalizeSubtitleHtml(
    data?.siteSubtitleHtml,
    DEFAULT_SITE_SUBTITLE_HTML,
    siteSubtitle,
  );

  return {
    logoSizePx,
    siteTitle: {
      ...siteTitle,
      text: stripHtmlToPlainText(siteTitleHtml) || siteTitle.text,
    },
    siteSubtitle: {
      ...siteSubtitle,
      text: stripHtmlToPlainText(siteSubtitleHtml) || siteSubtitle.text,
    },
    siteTitleHtml,
    siteSubtitleHtml,
  };
}

export async function readSiteBranding() {
  try {
    const raw = await fs.readFile(BRANDING_PATH, 'utf8');
    const data = JSON.parse(raw);
    return buildBrandingFromData(data);
  } catch (e) {
    if (e?.code === 'ENOENT') return { ...DEFAULTS };
    return { ...DEFAULTS };
  }
}

export async function writeSiteBranding(partial) {
  const current = await readSiteBranding();
  const next = { ...current };

  if ('logoSizePx' in partial) {
    const v = clampInt(partial.logoSizePx, 20, 96);
    if (v == null) throw new Error('invalid_logo_size');
    next.logoSizePx = v;
  }

  if ('siteTitle' in partial) {
    next.siteTitle = normalizeSiteTitle({
      ...current.siteTitle,
      ...(partial.siteTitle && typeof partial.siteTitle === 'object' ? partial.siteTitle : {}),
    });
  }

  if ('siteSubtitle' in partial) {
    next.siteSubtitle = normalizeSiteSubtitle({
      ...current.siteSubtitle,
      ...(partial.siteSubtitle && typeof partial.siteSubtitle === 'object' ? partial.siteSubtitle : {}),
    });
  }

  if ('siteTitleHtml' in partial) {
    const html = sanitizeSiteHtml(partial.siteTitleHtml);
    if (isRichHtmlEmpty(html)) throw new Error('invalid_title_html');
    next.siteTitleHtml = html;
    next.siteTitle = {
      ...next.siteTitle,
      text: stripHtmlToPlainText(html) || next.siteTitle.text,
    };
  }

  if ('siteSubtitleHtml' in partial) {
    next.siteSubtitleHtml = sanitizeSiteHtml(partial.siteSubtitleHtml);
    next.siteSubtitle = {
      ...next.siteSubtitle,
      text: stripHtmlToPlainText(next.siteSubtitleHtml) || '',
    };
  }

  await fs.mkdir(path.dirname(BRANDING_PATH), { recursive: true });
  await fs.writeFile(BRANDING_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
