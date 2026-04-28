/**
 * Fox News — hero מדף הבית (foxnews.com) + מבזקים מ־RSS; אנגלית כמקור; עברית/ערבית מתרגום (Google לא רשמי).
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const FOX_HOME_URL = 'https://www.foxnews.com/';
export const FOX_RSS_URL = 'https://moxie.foxnews.com/google-publisher/latest.xml';

const FOX_FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const FOX_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const FOX_HTTP_TIMEOUT_MS = 20_000;
const FOX_CACHE_TTL_MS = 60 * 1000;

const cache = new Map();
let inFlight = null;

function pickRandomUa() {
  return FOX_USER_AGENTS[Math.floor(Math.random() * FOX_USER_AGENTS.length)] || 'Mozilla/5.0';
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

function cacheSet(key, value, ttlMs = FOX_CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlMs) || FOX_CACHE_TTL_MS) });
}

async function fetchTextWithTimeout(url, { timeoutMs = FOX_HTTP_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        ...FOX_FETCH_HEADERS,
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
    return new URL(String(href || '').trim(), String(base || '').trim() || FOX_HOME_URL).toString();
  } catch {
    return null;
  }
}

function normalizeImageUrl(u) {
  const s = String(u || '').trim();
  if (!s || s.startsWith('data:')) return null;
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

function scoreHeadline(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return -1;
  // Fox homepage has many short promo/section labels; keep only real headlines
  if (t.length < 25) return -1;
  if (t.length > 240) return 240 - (t.length - 240);
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 8) return -1;
  let score = t.length;
  if (/[–—-]/.test(t)) score += 2;
  if (/Trump/i.test(t)) score += 2;
  return score;
}

function tryParseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function coerceImageUrl(image, baseUrl) {
  if (!image) return null;
  if (typeof image === 'string') return normalizeImageUrl(image);
  if (Array.isArray(image)) {
    for (const x of image) {
      const got = coerceImageUrl(x, baseUrl);
      if (got) return got;
    }
    return null;
  }
  if (typeof image === 'object') {
    if (image.url) return normalizeImageUrl(image.url);
    if (image['@id']) return normalizeImageUrl(image['@id']);
  }
  return null;
}

function extractHeroFromLdJson(html, baseUrl) {
  const s = String(html || '').slice(0, 2_500_000);
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  /** @type {Array<{ title: string, articleUrl: string|null, imageUrl: string|null, order: number }>} */
  const curated = [];
  let curatedOrder = 0;
  let best = null;
  let bestScore = -1;
  while ((m = re.exec(s)) !== null) {
    const raw = m[1].trim().replace(/^\s*<!--|-->?\s*$/g, '');
    const data = tryParseJson(raw);
    if (!data) continue;

    const visit = (node, depth) => {
      if (!node || depth > 40) return;
      if (Array.isArray(node)) return node.forEach((x) => visit(x, depth + 1));
      if (typeof node !== 'object') return;

      const t = String(node['@type'] || '');

      // Prefer homepage-curated list: WebPage/CollectionPage.hasPart (ordered)
      if (/WebPage|CollectionPage/i.test(t) && Array.isArray(node.hasPart) && node.hasPart.length) {
        const pickFromPart = (part) => {
          if (!part || typeof part !== 'object') return null;
          const pt = String(part['@type'] || '');
          if (!/NewsArticle|Article|ReportageNewsArticle/i.test(pt)) return null;
          const headline = String(part.headline || part.name || '').replace(/\s+/g, ' ').trim();
          const sc = scoreHeadline(headline);
          if (sc < 0) return null;
          const url = part.url ? absoluteUrl(baseUrl, String(part.url)) : null;
          if (!url || !/https?:\/\/(?:www\.)?foxnews\.com\//i.test(url)) return null;
          if (/\/shows\//i.test(url)) return null;
          const imageUrl = coerceImageUrl(part.image, baseUrl);
          if (imageUrl && /\/clear-16x9\.gif$/i.test(imageUrl)) return null;
          return { title: headline, articleUrl: url, imageUrl };
        };

        // Collect candidates (do not early-return; multiple scripts may exist)
        for (const part of node.hasPart) {
          const picked = pickFromPart(part);
          if (picked) curated.push({ ...picked, order: curatedOrder++ });
        }
      }

      if (/NewsArticle|Article|ReportageNewsArticle/i.test(t)) {
        const headline = String(node.headline || node.name || '').replace(/\s+/g, ' ').trim();
        const sc = scoreHeadline(headline);
        if (sc > bestScore) {
          const url = node.url ? absoluteUrl(baseUrl, String(node.url)) : null;
          const imageUrl = coerceImageUrl(node.image, baseUrl);
          best = { title: headline, articleUrl: url, imageUrl };
          bestScore = sc;
        }
      }
      if (node['@graph']) visit(node['@graph'], depth + 1);
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') visit(v, depth + 1);
      }
    };
    visit(data, 0);
  }

  if (curated.length) {
    // Prefer first live-news item; otherwise earliest curated item.
    const live = curated.find((c) => c.articleUrl && /\/live-news\//i.test(c.articleUrl));
    const chosen = live || curated.sort((a, b) => a.order - b.order)[0];
    if (chosen?.title) return { title: chosen.title, articleUrl: chosen.articleUrl, imageUrl: chosen.imageUrl };
  }
  return best && best.title ? best : null;
}

function extractHeroFromHtmlFallback(html, baseUrl) {
  const h = String(html || '');
  // Fox often uses <h2 class="title"> within a main "collection" for the lead story.
  // We'll pick the best-looking h2 text and nearest href/img.
  const headlineRe = /<h2[^>]*>([\s\S]{10,260}?)<\/h2>/gi;
  let m;
  let best = null;
  let bestScore = -1;
  let bestIndex = -1;
  while ((m = headlineRe.exec(h)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/Fox Nation|OutKick|Digital Originals|Economy|Fox News Flash/i.test(text)) continue;
    const sc = scoreHeadline(text);
    if (sc > bestScore) {
      best = text;
      bestScore = sc;
      bestIndex = m.index;
    }
    if (bestScore >= 90) break;
  }
  if (!best) return null;
  const start = Math.max(0, bestIndex - 2000);
  const end = Math.min(h.length, bestIndex + 2500);
  const block = h.slice(start, end);
  const hrefM = block.match(/\bhref=["']([^"']{1,1200})["']/i);
  const articleUrl = hrefM?.[1] ? absoluteUrl(baseUrl, hrefM[1]) : null;
  const imgM =
    block.match(/\b(?:data-src|src)=["']([^"']{10,1200})["']/i) ||
    block.match(/\bsrcset=["']([^"']{10,2400})["']/i);
  let imageUrl = null;
  if (imgM?.[1]) {
    const raw = imgM[0].toLowerCase().includes('srcset') ? imgM[1].split(',')[0]?.trim().split(/\s+/)[0] : imgM[1];
    imageUrl = normalizeImageUrl(raw);
  }
  return { title: best, articleUrl, imageUrl };
}

async function fetchFoxHomepageHero(homeUrl) {
  const cacheKey = 'fox_home_hero_v1';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  if (inFlight) return inFlight;

  const targets = [(homeUrl && String(homeUrl).trim()) || FOX_HOME_URL, FOX_HOME_URL];
  const uniqueTargets = [...new Set(targets.filter(Boolean))];

  inFlight = (async () => {
    let lastErr = null;
    for (const u of uniqueTargets) {
      try {
        const r = await fetchHomepageHtmlWithRetries(u, { tries: 3 });
        if (!r?.ok) continue;
        const baseUrl = r.url || u;
        const fromLd = extractHeroFromLdJson(r.text, baseUrl);
        const hero = fromLd || extractHeroFromHtmlFallback(r.text, baseUrl);
        if (!hero?.title) continue;
        cacheSet(cacheKey, hero, FOX_CACHE_TTL_MS);
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
  if (!res.ok) throw new Error(`Fox RSS HTTP ${res.status}`);
  return res.text();
}

/**
 * @typedef {{
 *   rssUrl?: string,
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} FoxNewsPayloadOptions
 */

/**
 * @param {FoxNewsPayloadOptions=} opts
 */
export async function buildFoxNewsPayload(opts = {}) {
  const rssUrl = (opts.rssUrl && String(opts.rssUrl).trim()) || FOX_RSS_URL;
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || FOX_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  const [homeHero, xml] = await Promise.all([fetchFoxHomepageHero(homeUrl), fetchRssXml(rssUrl)]);
  const items = parseRssItemsServer(xml);
  if (!items.length && !homeHero?.title) throw new Error('לא נמצאו פריטים ב־RSS של Fox וגם לא כותרת בדף הבית');

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
      flashersSource: 'fox_rss_plus_homepage_hero',
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}

