/**
 * BNA (Bahrain News Agency) — ניסיון לחלץ hero מדף הבית + fallback ל־RSS (אם מסופק).
 *
 * הערה: האתר לעיתים מוגן AWS WAF ("Human Verification"). במקרה כזה נחזיר שגיאה/פולבאק.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const BNA_HOME_URL = 'https://www.bna.bh/en';

const DEFAULT_RSS_URL = '';

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const CACHE_TTL_MS = 60 * 1000;
const HTTP_TIMEOUT_MS = 20_000;

const cache = new Map();
let inFlight = null;

function pickUa() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || 'Mozilla/5.0';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key, value, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlMs) || CACHE_TTL_MS) });
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        ...FETCH_HEADERS,
        'User-Agent': pickUa(),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    return { ok: res.ok, status: res.status, url: res.url || url, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetries(url, tries = 3) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await sleep(350 + Math.floor(Math.random() * 900));
      const r = await fetchText(url);
      if (r.ok) return r;
      if ([403, 405, 429, 500, 502, 503, 504].includes(r.status)) {
        lastErr = new Error(`HTTP ${r.status}`);
        await sleep(300 * attempt + Math.floor(Math.random() * 700));
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      await sleep(300 * attempt + Math.floor(Math.random() * 900));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('fetch failed');
}

function looksLikeHumanVerification(html) {
  const h = String(html || '');
  return /Human Verification/i.test(h) || /awsWafCookieDomainList|gokuProps/i.test(h);
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractOgContent(html, property) {
  const head = String(html || '').slice(0, 500000);
  const esc = String(property || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]*property=[\"']${esc}[\"'][^>]*content=[\"']([^\"']+)[\"']`, 'i');
  const re2 = new RegExp(`<meta[^>]*content=[\"']([^\"']+)[\"'][^>]*property=[\"']${esc}[\"']`, 'i');
  const m = head.match(re1) || head.match(re2);
  return m?.[1] ? stripTags(m[1]) : '';
}

function extractFirstHrefNearTitle(html, title) {
  if (!title) return null;
  const h = String(html || '');
  const idx = h.indexOf(title);
  if (idx < 0) return null;
  const block = h.slice(Math.max(0, idx - 2500), Math.min(h.length, idx + 2500));
  const m = block.match(/\bhref=["']([^"']{1,1400})["']/i);
  return m?.[1] ? m[1] : null;
}

function absoluteUrl(base, href) {
  try {
    return new URL(String(href || '').trim(), String(base || '').trim()).toString();
  } catch {
    return null;
  }
}

function extractFirstImageNearTitle(html, title, baseUrl) {
  if (!title) return null;
  const h = String(html || '');
  const idx = h.indexOf(title);
  if (idx < 0) return null;
  const block = h.slice(Math.max(0, idx - 2500), Math.min(h.length, idx + 2500));
  const srcset = block.match(/\bsrcset=["']([^"']{10,2400})["']/i);
  if (srcset?.[1]) {
    const first = srcset[1].split(',')[0]?.trim().split(/\s+/)[0];
    const u = first ? absoluteUrl(baseUrl, first) : null;
    if (u) return u;
  }
  const src = block.match(/\b(?:data-src|src)=["']([^"']{10,1400})["']/i);
  return src?.[1] ? absoluteUrl(baseUrl, src[1]) : null;
}

async function fetchHomepageHero(homeUrl) {
  const cacheKey = 'bna_home_hero_v1';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const r = await fetchWithRetries(homeUrl, 3);
    const html = r.text || '';
    if (!r.ok) throw new Error(`BNA homepage HTTP ${r.status}`);
    if (looksLikeHumanVerification(html)) throw new Error('BNA blocked by Human Verification (AWS WAF)');

    // Best-effort: use og:title (often reflects homepage/section, not always the hero)
    // If og:title is generic, fall back to <title>.
    let title = extractOgContent(html, 'og:title');
    if (!title || title.length < 12) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = t?.[1] ? stripTags(t[1]) : '';
    }
    if (!title || title.length < 12) throw new Error('לא נמצאה כותרת בדף הבית של BNA');

    const href = extractFirstHrefNearTitle(html, title);
    const articleUrl = href ? absoluteUrl(r.url || homeUrl, href) : null;
    const imageUrl = extractFirstImageNearTitle(html, title, r.url || homeUrl);

    const out = { title, articleUrl, imageUrl: imageUrl || null };
    cacheSet(cacheKey, out, CACHE_TTL_MS);
    return out;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function fetchRssXml(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BNA RSS HTTP ${res.status}`);
  return res.text();
}

/**
 * @typedef {{
 *   rssUrl?: string,
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} BnaNewsPayloadOptions
 */

/**
 * @param {BnaNewsPayloadOptions=} opts
 */
export async function buildBnaNewsPayload(opts = {}) {
  const rssUrl = (opts.rssUrl && String(opts.rssUrl).trim()) || DEFAULT_RSS_URL;
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || BNA_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  let homeHero = null;
  let heroError = null;
  try {
    homeHero = await fetchHomepageHero(homeUrl);
  } catch (e) {
    heroError = String(e?.message || e);
  }

  let items = [];
  let rssError = null;
  if (rssUrl) {
    try {
      const xml = await fetchRssXml(rssUrl);
      items = parseRssItemsServer(xml);
    } catch (e) {
      rssError = String(e?.message || e);
    }
  }

  if (!homeHero?.title && !items.length) {
    throw new Error(heroError || rssError || 'לא ניתן לטעון BNA (homepage/RSS)');
  }

  const firstRss = items[0] || { title: '', link: null, imageUrl: null, description: '' };

  const hero = {
    title: homeHero?.title || firstRss.title || '',
    fullTitle: homeHero?.title || firstRss.title || '',
    titleTranslations: { he: '', ar: '' },
    subTitle: '',
    subTitleTranslations: { he: '', ar: '' },
    imageUrl: homeHero?.imageUrl || firstRss.imageUrl || '',
    articleUrl: homeHero?.articleUrl || firstRss.link || null,
  };

  let heroTranslateErrors = {};
  if (tlTargets.length && String(hero.title || '').trim()) {
    try {
      const tr = await translateOneToMany(hero.title, { from: 'en', to: tlTargets });
      if (wantsHe) hero.titleTranslations.he = tr.translations?.he || '';
      if (wantsAr) hero.titleTranslations.ar = tr.translations?.ar || '';
      heroTranslateErrors = tr.errors || {};
    } catch (e) {
      heroTranslateErrors = { _all: String(e?.message || e) };
    }
  }

  const rawFlashers = items.slice(1, 1 + limit);
  let flashers = rawFlashers.map((it) => ({
    title: it.title || '',
    articleUrl: it.link || null,
    imageUrl: it.imageUrl || null,
    titleTranslations: { he: '', ar: '' },
  }));

  let flashersTranslateErrorsSample = [];
  if (tlTargets.length && translateFlashers && flashers.length) {
    const titles = flashers.map((f) => f.title);
    const { map, errors } = await translateManyStrings(titles, {
      from: 'en',
      to: tlTargets,
      concurrency: 5,
    });
    flashers = flashers.map((f) => {
      const key = String(f.title || '').trim();
      const row = map.get(key) || {};
      return {
        ...f,
        titleTranslations: {
          he: wantsHe ? row.he ?? '' : '',
          ar: wantsAr ? row.ar ?? '' : '',
        },
      };
    });
    flashersTranslateErrorsSample = errors.slice(0, 8);
  }

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrl,
      rssUrl: rssUrl || null,
      flashersSource: rssUrl ? 'bna_rss_plus_homepage_hero' : 'bna_homepage_hero_only',
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      heroFetchError: heroError,
      rssFetchError: rssError,
      flashersTranslateErrorsSample,
    },
  };
}

