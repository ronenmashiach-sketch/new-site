/**
 * BBC — כותרת ראשית מדף הבית (bbc.com) + מבזקים מ־RSS; אנגלית כמקור; עברית/ערבית מתרגום (Google לא רשמי).
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const BBC_HOME_URL = 'https://www.bbc.com/';
export const BBC_RSS_URL = 'https://feeds.bbci.co.uk/news/rss.xml';

const BBC_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const BBC_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const BBC_HTTP_TIMEOUT_MS = 20_000;
const BBC_CACHE_TTL_MS = 60 * 1000;

const cache = new Map();
let inFlight = null;

function pickRandomUa() {
  return BBC_USER_AGENTS[Math.floor(Math.random() * BBC_USER_AGENTS.length)] || 'Mozilla/5.0';
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

function cacheSet(key, value, ttlMs = BBC_CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlMs) || BBC_CACHE_TTL_MS) });
}

async function fetchTextWithTimeout(url, { timeoutMs = BBC_HTTP_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        ...BBC_FETCH_HEADERS,
        'User-Agent': pickRandomUa(),
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

async function fetchHomepageHtmlWithRetries(url, { tries = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await sleep(400 + Math.floor(Math.random() * 900));
      const r = await fetchTextWithTimeout(url);
      if (r.ok) return r;
      if ([403, 429, 500, 502, 503, 504].includes(r.status)) {
        await sleep(350 * attempt + Math.floor(Math.random() * 800));
        lastErr = new Error(`HTTP ${r.status}`);
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      await sleep(350 * attempt + Math.floor(Math.random() * 900));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('fetch failed');
}

function absoluteUrl(base, href) {
  try {
    return new URL(String(href || '').trim(), String(base || '').trim() || BBC_HOME_URL).toString();
  } catch {
    return null;
  }
}

function normalizeImageSrc(src, base) {
  const s = String(src || '').trim();
  if (!s || s.startsWith('data:')) return null;
  if (s.startsWith('//')) return `https:${s}`;
  return absoluteUrl(base, s);
}

function scoreHeadline(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return -1;
  if (t.length < 18) return -1;
  if (/^BBC\b/i.test(t)) return -1;
  let score = t.length;
  if (/[A-Za-z]/.test(t)) score += 5;
  if (/Trump/i.test(t)) score += 3;
  return score;
}

function pickBestFromSrcset(srcset) {
  const raw = String(srcset || '').trim();
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .map((p) => {
      const [u, w] = p.split(/\s+/);
      const width = parseInt(String(w || '').replace(/[^\d]/g, ''), 10);
      return { u, width: Number.isFinite(width) ? width : 0 };
    })
    .filter((x) => x.u);
  parts.sort((a, b) => b.width - a.width);
  return parts[0]?.u || null;
}

function extractHomepageHeroFromHtml(html, baseUrl) {
  const h = String(html || '');
  const headlineRe = /<h2[^>]*data-testid=["']card-headline["'][^>]*>([\s\S]*?)<\/h2>/gi;
  let m;
  let best = null;
  let bestScore = -1;
  let bestIndex = -1;
  while ((m = headlineRe.exec(h)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sc = scoreHeadline(text);
    if (sc > bestScore) {
      best = text;
      bestScore = sc;
      bestIndex = m.index;
    }
    if (bestScore >= 80) break;
  }
  if (!best) return null;

  const start = Math.max(0, bestIndex - 1800);
  const end = Math.min(h.length, bestIndex + 2200);
  const block = h.slice(start, end);

  const hrefM =
    block.match(/<a[^>]*data-testid=["']internal-link["'][^>]*href=["']([^"']+)["']/i) ||
    block.match(/<a[^>]*href=["']([^"']+)["'][^>]*data-testid=["']internal-link["']/i);
  const articleUrl = hrefM?.[1] ? absoluteUrl(baseUrl, hrefM[1]) : null;

  // Prefer srcset (largest) then src, nearest within the same block
  const srcsetM = block.match(/\bsrcSet=["']([^"']{10,2400})["']/i) || block.match(/\bsrcset=["']([^"']{10,2400})["']/i);
  const bestFromSrcset = srcsetM?.[1] ? pickBestFromSrcset(srcsetM[1]) : null;
  const srcM = block.match(/\bsrc=["']([^"']{10,1200})["']/i);
  const imageUrl = normalizeImageSrc(bestFromSrcset || srcM?.[1] || null, baseUrl);

  return { title: best, articleUrl, imageUrl: imageUrl || null };
}

async function fetchBbcHomepageHero(homeUrl) {
  const cacheKey = 'bbc_home_hero_v1';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  if (inFlight) return inFlight;

  const targets = [
    (homeUrl && String(homeUrl).trim()) || BBC_HOME_URL,
    BBC_HOME_URL,
    'https://www.bbc.com/news',
  ];
  const uniqueTargets = [...new Set(targets.filter(Boolean))];

  inFlight = (async () => {
    let lastErr = null;
    for (const u of uniqueTargets) {
      try {
        const r = await fetchHomepageHtmlWithRetries(u, { tries: 3 });
        if (!r?.ok) continue;
        const hero = extractHomepageHeroFromHtml(r.text, r.url || u);
        if (!hero?.title) continue;
        cacheSet(cacheKey, hero, BBC_CACHE_TTL_MS);
        return hero;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) return null;
    return null;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function fetchRssXml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`BBC RSS HTTP ${res.status}`);
  return res.text();
}

/**
 * @typedef {{
 *   rssUrl?: string,
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} BbcNewsPayloadOptions
 */

/**
 * @param {BbcNewsPayloadOptions=} opts
 */
export async function buildBbcNewsPayload(opts = {}) {
  const rssUrl = (opts.rssUrl && String(opts.rssUrl).trim()) || BBC_RSS_URL;
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || BBC_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  const [homeHero, xml] = await Promise.all([fetchBbcHomepageHero(homeUrl), fetchRssXml(rssUrl)]);
  const items = parseRssItemsServer(xml);
  if (!items.length && !homeHero?.title) throw new Error('לא נמצאו פריטים ב־RSS של BBC וגם לא כותרת בדף הבית');

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
      rssUrl,
      flashersSource: 'bbc_rss_plus_homepage_hero',
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}

