/**
 * CNN — כותרות מ־RSS (edition), אנגלית כמקור; עברית וערבית מתרגום (Google לא רשמי).
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const CNN_HOME_URL = 'https://www.cnn.com/';
export const CNN_RSS_URL = 'https://rss.cnn.com/rss/edition.rss';

/** כתובות ישירות ל־CNN; כשל TLS/רשת ל־rss.cnn.com נפוץ מאחורי פרוקסי ארגוני. */
const CNN_RSS_DIRECT_CANDIDATES = [
  CNN_RSS_URL,
  'https://rss.cnn.com/rss/cnn_topstories.xml',
  'https://rss.cnn.com/rss/edition_world.rss',
];

/** כשכל ה־RSS הישירים נכשלים — מקור אחר (לרוב עובר כש־rss.cnn.com חסום). */
export const GOOGLE_NEWS_CNN_RSS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:cnn.com when:3d') +
  '&hl=en&gl=US&ceid=US:en';

function stripCnnGoogleNewsTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*CNN\.com\s*$/i, '')
    .replace(/\s*-\s*CNN\s*$/i, '')
    .trim();
}

/** קישור כתבה ישיר בדומיין CNN (לא news.google.com). */
function isDirectCnnArticleUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'cnn.com' || h.endsWith('.cnn.com');
  } catch {
    return false;
  }
}

const CNN_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const CNN_HOME_HTTP_CANDIDATES = [
  'https://www.cnn.com/',
  'https://edition.cnn.com/',
];

const CNN_SCRAPE_CACHE_TTL_MS = 60 * 1000;
const CNN_HTTP_TIMEOUT_MS = 20_000;

const CNN_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const cnnScrapeCache = new Map();
let cnnScrapeInFlight = null;

function pickRandomUa() {
  return CNN_USER_AGENTS[Math.floor(Math.random() * CNN_USER_AGENTS.length)] || CNN_FETCH_HEADERS['User-Agent'];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cacheGet(key) {
  const e = cnnScrapeCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    cnnScrapeCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key, value, ttlMs = CNN_SCRAPE_CACHE_TTL_MS) {
  cnnScrapeCache.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlMs) || CNN_SCRAPE_CACHE_TTL_MS) });
}

async function fetchTextWithTimeout(url, { timeoutMs = CNN_HTTP_TIMEOUT_MS, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        ...CNN_FETCH_HEADERS,
        ...headers,
        'User-Agent': headers['User-Agent'] || pickRandomUa(),
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
        await sleep(300 * attempt + Math.floor(Math.random() * 600));
        lastErr = new Error(`HTTP ${r.status}`);
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      await sleep(350 * attempt + Math.floor(Math.random() * 700));
    }
  }
  if (lastErr) throw lastErr;
  throw new Error('fetch failed');
}

function normalizeCnnHomepageHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return `https://www.cnn.com${href}`;
  return null;
}

function absoluteUrl(base, href) {
  try {
    return new URL(String(href || '').trim(), String(base || '').trim() || 'https://www.cnn.com/').toString();
  } catch {
    return null;
  }
}

function normalizeImageSrc(src, base) {
  const s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith('data:')) return null;
  if (s.startsWith('//')) return `https:${s}`;
  return absoluteUrl(base, s);
}

function scoreCnnHeadlineCandidate(s) {
  const t = String(s || '').trim();
  if (!t) return -1;
  if (t.length < 25) return -1;
  if (t.length > 220) return Math.max(0, 220 - (t.length - 220));
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters < 10) return -1;
  let score = t.length;
  if (/trump/i.test(t)) score += 5;
  if (/[–—-]/.test(t)) score += 2;
  if (/[’']/g.test(t)) score += 1;
  return score;
}

function pickBestImageCandidate(urls) {
  const list = (urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  if (!list.length) return null;
  // Prefer CNN-ish CDN paths and larger sizes if hinted
  const scored = list
    .map((u) => {
      let score = 0;
      const lower = u.toLowerCase();
      if (lower.includes('cnn')) score += 10;
      if (lower.includes('large') || lower.includes('super') || lower.includes('1100')) score += 6;
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(lower)) score += 3;
      if (lower.includes('logo') || lower.includes('sprite') || lower.includes('icon')) score -= 20;
      return { u, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.u || null;
}

function extractSpotlightDetailsFromHtml(html, baseUrl) {
  const h = String(html || '');
  const blocks = [];
  const re = /container_spotlight-package[\s\S]{0,3500}/gi;
  let m;
  while ((m = re.exec(h)) !== null) blocks.push(m[0]);
  const pool = blocks.length ? blocks : [h.slice(0, 1_200_000)];

  let bestTitle = null;
  let bestBlock = null;
  let bestScore = -1;
  for (const block of pool) {
    const titles = [];
    const tRe = /data-title="([^"]{10,500})"/gi;
    const cRe = /data-collapsed-text="([^"]{10,500})"/gi;
    let tm;
    while ((tm = tRe.exec(block)) !== null) titles.push(tm[1]);
    while ((tm = cRe.exec(block)) !== null) titles.push(tm[1]);

    for (const cand of titles) {
      const sc = scoreCnnHeadlineCandidate(cand);
      if (sc > bestScore) {
        bestScore = sc;
        bestTitle = cand;
        bestBlock = block;
      }
    }
  }
  if (!bestTitle || !bestBlock) return null;

  const title = String(bestTitle).trim();

  // Link: prefer first non-empty href in the chosen block
  const hrefM = bestBlock.match(/\bhref="([^"]{1,1200})"/i);
  const articleUrl = normalizeCnnHomepageHref(hrefM ? hrefM[1] : null) || absoluteUrl(baseUrl, hrefM ? hrefM[1] : null);

  // Image: try src, data-src, srcset (first url)
  const imgUrls = [];
  const srcM = bestBlock.match(/\b(?:src|data-src|data-original|data-lazy-src)=["']([^"']{6,1200})["']/gi);
  if (srcM) {
    for (const raw of srcM) {
      const um = raw.match(/=["']([^"']+)["']/);
      if (um?.[1]) imgUrls.push(normalizeImageSrc(um[1], baseUrl));
    }
  }
  const srcsetM = bestBlock.match(/\bsrcset=["']([^"']{10,2000})["']/i);
  if (srcsetM?.[1]) {
    const first = srcsetM[1].split(',')[0]?.trim().split(/\s+/)[0];
    if (first) imgUrls.push(normalizeImageSrc(first, baseUrl));
  }
  const imageUrl = pickBestImageCandidate(imgUrls.filter(Boolean));

  return { title, articleUrl: articleUrl || null, imageUrl: imageUrl || null };
}

/**
 * הכותרת הראשית שמוצגת בדף הבית של CNN (Spotlight).
 * @returns {Promise<{ title: string, articleUrl: string | null, imageUrl: string | null } | null>}
 */
async function fetchHomepageSpotlightHero(homeUrl) {
  const cacheKey = 'cnn_home_spotlight_v2';
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (cnnScrapeInFlight) return cnnScrapeInFlight;

  const startUrl = (homeUrl && String(homeUrl).trim()) || CNN_HOME_URL;
  const targets = [startUrl, ...CNN_HOME_HTTP_CANDIDATES].filter(Boolean);
  const uniqueTargets = [...new Set(targets)];

  cnnScrapeInFlight = (async () => {
    let lastErr = null;
    for (const u of uniqueTargets) {
      try {
        const r = await fetchHomepageHtmlWithRetries(u, { tries: 3 });
        if (!r?.ok) continue;
        const details = extractSpotlightDetailsFromHtml(r.text, r.url || u);
        if (!details?.title) continue;
        const out = { title: details.title, articleUrl: details.articleUrl || null, imageUrl: details.imageUrl || null };
        cacheSet(cacheKey, out, CNN_SCRAPE_CACHE_TTL_MS);
        return out;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) return null;
    return null;
  })();

  try {
    return await cnnScrapeInFlight;
  } finally {
    cnnScrapeInFlight = null;
  }
}

function normalizeGoogleEscapedMarkup(html) {
  return String(html || '')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u003d/gi, '=')
    .replace(/\\\//g, '/');
}

function pickPreferredCnnImageUrl(candidates) {
  const list = (candidates || []).map((u) => String(u || '').trim().replace(/&amp;/g, '&')).filter(Boolean);
  if (!list.length) return '';
  const cnnish = list.find((u) => /cnn\.com|cnn\.io|turner\.com/i.test(u));
  return cnnish || list[0];
}

function collectMetaContentByProperty(html, prop) {
  const head = String(html || '').slice(0, 650000);
  const out = [];
  const esc = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]*property=["']${esc}["'][^>]*content=["']([^"']+)["']`, 'gi');
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${esc}["']`, 'gi');
  let m;
  while ((m = re1.exec(head)) !== null) out.push(m[1]);
  while ((m = re2.exec(head)) !== null) out.push(m[1]);
  return out;
}

function collectMetaContentByName(html, name) {
  const head = String(html || '').slice(0, 650000);
  const out = [];
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]*name=["']${esc}["'][^>]*content=["']([^"']+)["']`, 'gi');
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${esc}["']`, 'gi');
  let m;
  while ((m = re1.exec(head)) !== null) out.push(m[1]);
  while ((m = re2.exec(head)) !== null) out.push(m[1]);
  return out;
}

/** תמונה מ־NewsArticle / Article ב־JSON-LD (CNN לעיתים בלי meta og בשורה אחת). */
function extractCnnImageFromLdJson(html) {
  const s = String(html || '').slice(0, 2_500_000);
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const collected = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    let raw = m[1].trim().replace(/^\s*<!--|-->?\s*$/g, '');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const visit = (node, depth) => {
      if (!node || depth > 40) return;
      if (Array.isArray(node)) {
        node.forEach((x) => visit(x, depth + 1));
        return;
      }
      if (typeof node !== 'object') return;
      const t = String(node['@type'] || '');
      if (/NewsArticle|Article|ReportageNewsArticle/i.test(t) && node.image != null) {
        const im = node.image;
        if (typeof im === 'string' && /^https?:\/\//i.test(im)) collected.push(im);
        else if (Array.isArray(im)) {
          for (const x of im) {
            if (typeof x === 'string' && /^https?:\/\//i.test(x)) collected.push(x);
            else if (x && typeof x === 'object' && x.url) collected.push(String(x.url));
          }
        } else if (im && typeof im === 'object' && im.url) collected.push(String(im.url));
      }
      if (node['@graph']) visit(node['@graph'], depth + 1);
      for (const v of Object.values(node)) {
        if (v && typeof v === 'object') visit(v, depth + 1);
      }
    };
    visit(data, 0);
  }
  return pickPreferredCnnImageUrl(collected);
}

function extractOgImageFromHtml(html) {
  const head = String(html || '').slice(0, 650000);
  const og = [...collectMetaContentByProperty(head, 'og:image'), ...collectMetaContentByProperty(head, 'og:image:url')];
  const tw = [
    ...collectMetaContentByName(head, 'twitter:image'),
    ...collectMetaContentByName(head, 'twitter:image:src'),
  ];
  const fromMeta = pickPreferredCnnImageUrl([...og, ...tw]);
  if (fromMeta) return fromMeta;

  const fromLd = extractCnnImageFromLdJson(html);
  if (fromLd) return fromLd;

  const loose = head.match(/https:\/\/[a-z0-9.-]*cnn\.com\/[^"'<\s]+\.(?:jpe?g|webp|png)/i);
  if (loose?.[0]) return loose[0].replace(/&amp;/g, '&');
  return '';
}

function isGoogleNewsArticleUrl(urlString) {
  try {
    const u = new URL(urlString);
    const h = u.hostname.toLowerCase();
    if (h === 'news.google.com') return true;
    if (h === 'www.google.com' && u.pathname.startsWith('/url')) return true;
    return false;
  } catch {
    return false;
  }
}

/** אחרי redirect ל-google.com/url — הפרמטר q או url לעיתים מכיל קישור CNN. */
function cnnUrlFromGoogleRedirectPage(finalUrl, html) {
  try {
    const u = new URL(finalUrl);
    if (u.hostname.toLowerCase() !== 'www.google.com' || !u.pathname.startsWith('/url')) return '';
    const q = u.searchParams.get('q') || u.searchParams.get('url');
    if (q && isDirectCnnArticleUrl(q)) return q.trim();
  } catch {
    /* ignore */
  }
  const slice = normalizeGoogleEscapedMarkup(String(html || '').slice(0, 200000));
  const m = slice.match(/https:\/\/(?:www\.|edition\.|amp\.|us\.)?cnn\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9/_-]+/i);
  if (m?.[0] && isDirectCnnArticleUrl(m[0])) return m[0].replace(/&amp;/g, '&');
  return '';
}

/** דף עטיפה של Google News — חיפוש canonical או קישור תאריךי ל־CNN. */
function extractCnnUrlFromGoogleNewsHtml(html) {
  const h = normalizeGoogleEscapedMarkup(String(html || '').slice(0, 900000));
  const canon =
    h.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](https?:\/\/[^"']*cnn\.com[^"']*)["']/i) ||
    h.match(/href=["'](https?:\/\/[^"']*cnn\.com[^"']*)["'][^>]*rel=["']canonical["']/i);
  if (canon?.[1]) {
    const c = canon[1].trim().replace(/&amp;/g, '&');
    if (isDirectCnnArticleUrl(c)) return c.split('?')[0];
  }
  const dated = h.match(/https:\/\/(?:www\.|edition\.|amp\.|us\.)?cnn\.com\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9/_-]+/gi);
  if (dated) {
    for (const raw of dated) {
      const clean = raw.replace(/&amp;/g, '&').split('?')[0].replace(/\/+$/, '');
      if (isDirectCnnArticleUrl(clean)) return clean;
    }
  }
  /** כתבות ללא תאריך בנתיב, למשל /world/live-news/... */
  const live = h.match(/https:\/\/(?:www\.|edition\.|amp\.|us\.)?cnn\.com\/[a-z0-9/_-]+\/live-news\/[a-z0-9/_-]+/gi);
  if (live) {
    for (const raw of live) {
      const clean = raw.replace(/&amp;/g, '&').split('?')[0].replace(/\/+$/, '');
      if (isDirectCnnArticleUrl(clean)) return clean;
    }
  }
  return '';
}

/**
 * תמונת hero מ־og/twitter כשחסר ב־RSS.
 * תומך בקישור ישיר ל־CNN וב־Google News (פתרון ל־CNN אמיתי ואז og:image).
 * @returns {Promise<{ imageUrl: string, resolvedArticleUrl: string | null }>}
 */
async function fetchHeroImageFromArticlePage(articleUrl) {
  if (!articleUrl) return { imageUrl: '', resolvedArticleUrl: null };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 14000);
  const fetchOpts = {
    headers: CNN_FETCH_HEADERS,
    cache: 'no-store',
    redirect: 'follow',
    signal: ac.signal,
  };
  try {
    if (isDirectCnnArticleUrl(articleUrl)) {
      const res = await fetch(articleUrl, fetchOpts);
      if (!res.ok) return { imageUrl: '', resolvedArticleUrl: null };
      const html = await res.text();
      return { imageUrl: extractOgImageFromHtml(html), resolvedArticleUrl: null };
    }

    if (!isGoogleNewsArticleUrl(articleUrl)) return { imageUrl: '', resolvedArticleUrl: null };

    const res = await fetch(articleUrl, fetchOpts);
    if (!res.ok) return { imageUrl: '', resolvedArticleUrl: null };
    const html = await res.text();
    const finalUrl = res.url || articleUrl;

    if (isDirectCnnArticleUrl(finalUrl)) {
      return { imageUrl: extractOgImageFromHtml(html), resolvedArticleUrl: finalUrl };
    }

    let cnnUrl =
      cnnUrlFromGoogleRedirectPage(finalUrl, html) || extractCnnUrlFromGoogleNewsHtml(html);
    if (!cnnUrl) return { imageUrl: '', resolvedArticleUrl: null };

    const res2 = await fetch(cnnUrl, fetchOpts);
    if (!res2.ok) return { imageUrl: '', resolvedArticleUrl: cnnUrl };
    const html2 = await res2.text();
    return { imageUrl: extractOgImageFromHtml(html2), resolvedArticleUrl: cnnUrl };
  } catch {
    return { imageUrl: '', resolvedArticleUrl: null };
  } finally {
    clearTimeout(t);
  }
}

function secondaryFromDescription(desc) {
  const d = String(desc || '').trim();
  if (!d) return '';
  const parts = d.split(/\.\s+/);
  if (parts.length > 1 && parts[0].length < 500) return parts[0].trim();
  return d.slice(0, 280).trim();
}

async function fetchRssXml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`CNN RSS HTTP ${res.status}`);
  return res.text();
}

/**
 * @returns {Promise<{ xml: string, feedUrl: string, feedKind: 'cnn_rss' | 'cnn_google_news' }>}
 */
async function fetchCnnRssXmlWithFallback(userRssOverride) {
  const directUrls = userRssOverride ? [userRssOverride] : CNN_RSS_DIRECT_CANDIDATES;
  let lastDirectErr = null;
  for (const u of directUrls) {
    try {
      const xml = await fetchRssXml(u);
      return { xml, feedUrl: u, feedKind: 'cnn_rss' };
    } catch (e) {
      lastDirectErr = e;
    }
  }
  try {
    const xml = await fetchRssXml(GOOGLE_NEWS_CNN_RSS);
    return { xml, feedUrl: GOOGLE_NEWS_CNN_RSS, feedKind: 'cnn_google_news' };
  } catch (e) {
    const a = lastDirectErr ? String(lastDirectErr?.message || lastDirectErr) : '';
    const b = String(e?.message || e);
    throw new Error(a && b ? `${a} | ${b}` : a || b || 'fetch failed');
  }
}

function normalizeItemsForFeedKind(items, feedKind) {
  if (feedKind !== 'cnn_google_news') return items;
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const title = stripCnnGoogleNewsTitle(it.title || '');
    if (title.length < 8) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, title });
  }
  return out;
}

/**
 * @typedef {{
 *   rssUrl?: string,
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} CnnNewsPayloadOptions
 */

/**
 * @param {CnnNewsPayloadOptions=} opts
 */
export async function buildCnnNewsPayload(opts = {}) {
  const rssUrlRequested = (opts.rssUrl && String(opts.rssUrl).trim()) || CNN_RSS_URL;
  const userRssOverride = opts.rssUrl && String(opts.rssUrl).trim() ? rssUrlRequested : null;
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || CNN_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  const { xml, feedUrl, feedKind } = await fetchCnnRssXmlWithFallback(userRssOverride);
  let items = parseRssItemsServer(xml);
  items = normalizeItemsForFeedKind(items, feedKind);
  if (!items.length) throw new Error('לא נמצאו פריטים ב־RSS של CNN');

  const first = items[0];
  const subEn = secondaryFromDescription(first.description);

  // Prefer live homepage spotlight headline (matches what users see on cnn.com)
  let homepageHero = null;
  try {
    homepageHero = await fetchHomepageSpotlightHero(homeUrl);
  } catch {
    homepageHero = null;
  }

  const hero = {
    title: homepageHero?.title || first.title || '',
    fullTitle: homepageHero?.title || first.title || '',
    titleTranslations: { he: '', ar: '' },
    subTitle: subEn,
    subTitleTranslations: { he: '', ar: '' },
    imageUrl: homepageHero?.imageUrl || first.imageUrl || '',
    articleUrl: homepageHero?.articleUrl || first.link || null,
  };

  if (!String(hero.imageUrl || '').trim() && hero.articleUrl) {
    const { imageUrl: ogImg, resolvedArticleUrl } = await fetchHeroImageFromArticlePage(hero.articleUrl);
    if (ogImg) hero.imageUrl = ogImg;
    if (resolvedArticleUrl) hero.articleUrl = resolvedArticleUrl;
  }

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
  if (tlTargets.length && String(hero.subTitle || '').trim()) {
    try {
      const subTr = await translateOneToMany(hero.subTitle, {
        from: 'en',
        to: tlTargets,
        preserveHtml: true,
      });
      if (wantsHe) hero.subTitleTranslations.he = subTr.translations?.he || '';
      if (wantsAr) hero.subTitleTranslations.ar = subTr.translations?.ar || '';
    } catch {
      /* ignore subtitle */
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
      rssUrl: feedUrl,
      rssUrlRequested,
      rssFeedKind: feedKind,
      flashersSource:
        feedKind === 'cnn_google_news'
          ? 'cnn_google_news_rss_plus_translate'
          : 'cnn_edition_rss_plus_translate',
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}
