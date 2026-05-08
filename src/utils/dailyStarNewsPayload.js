/**
 * Daily Star Lebanon — WordPress; סדר עדיפות:
 * 1) דף הבית (JSON-LD + קישורי כתבות ב־HTML) — תואם למה שמוצג בגלישה כשהשרת לא מקבל דף אתגר Cloudflare.
 * 2) RSS רשמי (כמה נתיבים).
 * 3) גיבוי Google News RSS (site:dailystar.com.lb).
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer, plainTextFromRssHtml } from '@/utils/rssParseServer';
import {
  fetchWithRetries,
  formatNestedFetchError,
} from '@/utils/serverFetchIpv4';

export const DAILY_STAR_HOME_URL = 'https://www.dailystar.com.lb/';

/** ניסיון RSS ישיר לפני Google News */
const RSS_CANDIDATES = [
  'https://www.dailystar.com.lb/rss.xml',
  'https://www.dailystar.com.lb/rss',
  'https://www.dailystar.com.lb/feed',
];

export const GOOGLE_NEWS_DAILY_STAR_PRIMARY =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:www.dailystar.com.lb') +
  '&hl=en&gl=LB&ceid=LB:en';

const GOOGLE_NEWS_FALLBACK_URLS = [
  GOOGLE_NEWS_DAILY_STAR_PRIMARY,
  'https://news.google.com/rss/search?q=' +
    encodeURIComponent('site:dailystar.com.lb') +
    '&hl=en&gl=US&ceid=US:en',
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function pickUa() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || 'Mozilla/5.0';
}

/** דף אתגר Cloudflare */
function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 16000).toLowerCase();
  if (t.includes('just a moment')) return true;
  if (t.includes('cf-chl')) return true;
  if (t.includes('/cdn-cgi/challenge-platform/')) return true;
  if (t.includes('challenges.cloudflare.com')) return true;
  if (t.includes('checking your browser before accessing')) return true;
  if (t.includes('cf-turnstile')) return true;
  if (t.includes('enable javascript') && t.includes('cloudflare')) return true;
  return false;
}

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name.toLowerCase()] || m);
}

function stripTags(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ');
}

function normalizeDailyStarUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!isDailyStarArticleLink(u.href)) return urlStr;
    u.hash = '';
    return u.toString();
  } catch {
    return urlStr;
  }
}

function dailyStarUrlKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}

/** דפי מדור בלבד / ניווט — לא כתבות */
function isLikelyArticlePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  const first = parts[0].toLowerCase();
  const blockRoots = new Set([
    'news',
    'sports',
    'business',
    'culture',
    'opinion',
    'technology',
    'predictions',
    'contact',
    'about-us',
    'about',
    'term-of-use',
    'privacy-policy',
    'cookies-policy',
    'page',
    'category',
    'tag',
    'author',
    'feed',
    'wp-json',
    'wp-content',
    'wp-admin',
    'search',
    'ar',
    'en',
  ]);
  if (blockRoots.has(first)) return false;
  return true;
}

function extractLdImage(im) {
  if (!im) return '';
  if (typeof im === 'string' && /^https?:\/\//i.test(im)) return im.trim();
  if (Array.isArray(im)) {
    for (const x of im) {
      const u = extractLdImage(x);
      if (u) return u;
    }
    return '';
  }
  if (im && typeof im === 'object' && im.url) return String(im.url).trim();
  return '';
}

function resolveNewsArticleUrl(node) {
  let u = node.url;
  if (u && typeof u === 'object' && u['@id']) u = u['@id'];
  if (!u && node.mainEntityOfPage) {
    const m = node.mainEntityOfPage;
    if (typeof m === 'string') u = m;
    else if (m && typeof m === 'object') u = m['@id'] || m.url;
  }
  return typeof u === 'string' ? u.trim() : '';
}

function pushArticle(collected, seen, title, url, imageUrl, description) {
  if (!title || !url || !isDailyStarArticleLink(url)) return;
  let pathKey = '';
  try {
    pathKey = dailyStarUrlKey(url);
  } catch {
    return;
  }
  if (!pathKey || !isLikelyArticlePath(pathKey)) return;
  if (seen.has(pathKey)) return;
  seen.add(pathKey);
  const cleanTitle = stripTags(decodeHtmlEntities(title)).replace(/\s+/g, ' ').trim();
  if (isJunkFeedTitle(cleanTitle)) return;
  collected.push({
    title: cleanTitle,
    articleUrl: normalizeDailyStarUrl(url),
    imageUrl: imageUrl || '',
    description: plainTextFromRssHtml(description || '').slice(0, 500),
  });
}

function visitLd(node, collected, seen, depth) {
  if (!node || depth > 48) return;
  if (Array.isArray(node)) {
    for (const x of node) visitLd(x, collected, seen, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  const t = node['@type'];
  const types = Array.isArray(t) ? t.map(String) : [String(t || '')];

  if (types.some((x) => /NewsArticle|Article/i.test(x))) {
    const headline = node.headline || node.name;
    const url = resolveNewsArticleUrl(node);
    const imageUrl = extractLdImage(node.image);
    const desc = node.description || '';
    if (headline && url) pushArticle(collected, seen, String(headline), url, imageUrl, desc);
  }

  if (types.some((x) => /ItemList/i.test(x)) && Array.isArray(node.itemListElement)) {
    for (const el of node.itemListElement) {
      if (!el || typeof el !== 'object') continue;
      if (el.item) {
        if (typeof el.item === 'object') visitLd(el.item, collected, seen, depth + 1);
        else if (typeof el.item === 'string' && el.name) {
          pushArticle(collected, seen, String(el.name), el.item, '', '');
        }
      }
      if (typeof el.url === 'string' && el.name) {
        pushArticle(collected, seen, String(el.name), el.url, '', '');
      }
    }
  }

  if (node['@graph']) visitLd(node['@graph'], collected, seen, depth + 1);
  for (const k of Object.keys(node)) {
    if (k === '@context' || k === '@type') continue;
    const v = node[k];
    if (v && typeof v === 'object') visitLd(v, collected, seen, depth + 1);
  }
}

function collectFromJsonLd(html) {
  const s = String(html || '').slice(0, 3_500_000);
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const collected = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(s)) !== null) {
    let raw = m[1].trim().replace(/^\s*<!--|-->?\s*$/g, '');
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    visitLd(data, collected, seen, 0);
  }
  return collected;
}

function collectFromAnchors(html) {
  const full = String(html || '');
  const footerIdx = full.search(/<footer\b/i);
  const s = footerIdx > 0 ? full.slice(0, footerIdx) : full;
  const re =
    /<a\s+[^>]*href=["'](https?:\/\/(?:www\.)?dailystar\.com\.lb[^"'#]*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const collected = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(s)) !== null) {
    const href = String(m[1] || '').replace(/&amp;/g, '&').trim();
    let title = stripTags(decodeHtmlEntities(m[2])).replace(/\s+/g, ' ').trim();
    if (!href || title.length < 10) continue;
    pushArticle(collected, seen, title, href, '', '');
    if (collected.length > 160) break;
  }
  return collected;
}

function mergeHomepageExtractions(ldCards, anchorCards) {
  const seen = new Set(ldCards.map((c) => dailyStarUrlKey(c.articleUrl)));
  const out = [...ldCards];
  for (const c of anchorCards) {
    const k = dailyStarUrlKey(c.articleUrl);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length > 130) break;
  }
  return out;
}

function homepageCardsToFeedItems(cards) {
  return cards.map((c) => ({
    title: c.title,
    link: c.articleUrl,
    description: c.description || '',
    imageUrl: c.imageUrl || '',
    pubDate: '',
  }));
}

function buildHomepageFetchHeaders() {
  return {
    'User-Agent': pickUa(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Connection: 'close',
    'Upgrade-Insecure-Requests': '1',
  };
}

/** זמן קצוב כולל לסקרייפ דף הבית — אחריו נופלים ל-RSS בלי לחסום את השרת דקות */
const HOMEPAGE_EXTRACT_BUDGET_MS = 22_000;

async function fetchHomepageHtml(url) {
  const r = await fetchWithRetries(url, 2, buildHomepageFetchHeaders());
  const text = r.text || '';
  if (!r.ok) throw new Error(`דף הבית HTTP ${r.status}`);
  return text;
}

async function extractHomepageCardsInner(homeUrl) {
  let html;
  try {
    html = await fetchHomepageHtml(homeUrl);
  } catch {
    return null;
  }
  if (looksLikeCloudflareBlock(html)) return null;

  const fromLd = collectFromJsonLd(html);
  const fromAnchors = collectFromAnchors(html);
  const cards = mergeHomepageExtractions(fromLd, fromAnchors);
  return cards.length ? cards : null;
}

/**
 * כרטיסי כתבות בסדר מופע בדף (כמו שמוצג לגולש).
 * @returns {Promise<{ title: string, articleUrl: string, imageUrl: string, description: string }[] | null>}
 */
async function tryExtractHomepageCards(homeUrl) {
  try {
    return await Promise.race([
      extractHomepageCardsInner(homeUrl),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('homepage extract timeout')), HOMEPAGE_EXTRACT_BUDGET_MS),
      ),
    ]);
  } catch {
    return null;
  }
}

function buildRssFetchHeaders() {
  return {
    'User-Agent': pickUa(),
    Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Connection: 'close',
  };
}

function isDailyStarArticleLink(urlStr) {
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return h === 'dailystar.com.lb' || h.endsWith('.dailystar.com.lb');
  } catch {
    return false;
  }
}

function stripSeriesTitle(title) {
  return String(title || '')
    .replace(/\s*[-|]\s*The Daily Star\s*$/i, '')
    .replace(/\s*[-|]\s*Daily Star Lebanon\s*$/i, '')
    .replace(/\s*[-|]\s*Daily Star\s*$/i, '')
    .trim();
}

function isJunkFeedTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t || t.length < 8) return true;
  if (/^daily star\b/i.test(t) && t.length < 24) return true;
  if (/^contact us\b/i.test(t)) return true;
  return false;
}

function parsePubDateMs(pubDate) {
  const ms = Date.parse(String(pubDate || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

/** פריטים מפיד Google News — לא תמיד קישור ישיר לדומיין המקור */
function prepareGoogleNewsFeedItems(items, { maxAgeMs = 60 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripSeriesTitle(it.title);
    if (isJunkFeedTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link) continue;
    cleaned.push({
      ...it,
      title: stripped,
      description: String(it.description || '').trim(),
      link,
    });
  }
  cleaned.sort((a, b) => parsePubDateMs(b.pubDate) - parsePubDateMs(a.pubDate));
  const seen = new Set();
  const deduped = [];
  for (const it of cleaned) {
    const k = it.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }
  return deduped;
}

/** פריטים מ־RSS ישיר — רק קישורים לדומיין Daily Star */
function filterDirectRssItems(items) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const link = String(it.link || '').trim();
    if (!isDailyStarArticleLink(link)) continue;
    const title = stripSeriesTitle(it.title);
    if (isJunkFeedTitle(title)) continue;
    const k = title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      ...it,
      title,
      link,
    });
  }
  return out;
}

async function fetchRssXml(url) {
  const headers = buildRssFetchHeaders();
  const r = await fetchWithRetries(url, 5, headers);
  const xml = r.text || '';
  if (!r.ok) throw new Error(`RSS HTTP ${r.status}`);
  return xml;
}

/**
 * @typedef {{
 *   rssUrl?: string,
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} DailyStarNewsPayloadOptions
 */

/**
 * @param {DailyStarNewsPayloadOptions=} opts
 */
export async function buildDailyStarNewsPayload(opts = {}) {
  const explicitRss = (opts.rssUrl && String(opts.rssUrl).trim()) || '';
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || DAILY_STAR_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  let items = [];
  /** @type {string | null} */
  let feedUrlUsed = null;
  /** @type {'homepage_html' | 'daily_star_rss' | 'google_news_rss'} */
  let flashersSource = 'daily_star_rss';
  let rssAttemptError = '';
  let homepageAttemptError = '';

  if (!explicitRss) {
    try {
      const cards = await tryExtractHomepageCards(homeUrl);
      if (cards?.length) {
        items = homepageCardsToFeedItems(cards);
        flashersSource = 'homepage_html';
      }
    } catch (e) {
      homepageAttemptError = formatNestedFetchError(e);
    }
  }

  const rssTryList = explicitRss ? [explicitRss] : RSS_CANDIDATES;

  if (!items.length) {
    for (const tryUrl of rssTryList) {
      try {
        const xml = await fetchRssXml(tryUrl);
        if (looksLikeCloudflareBlock(xml)) {
          rssAttemptError = `Cloudflare בפיד (${tryUrl})`;
          continue;
        }
        const parsed = parseRssItemsServer(xml);
        const filtered = filterDirectRssItems(parsed);
        if (filtered.length) {
          items = filtered;
          feedUrlUsed = tryUrl;
          rssAttemptError = '';
          flashersSource = 'daily_star_rss';
          break;
        }
        rssAttemptError = `RSS ריק אחרי סינון (${tryUrl})`;
      } catch (e) {
        rssAttemptError = formatNestedFetchError(e);
      }
    }
  }

  if (!items.length && !explicitRss) {
    let gErr = '';
    for (const gUrl of GOOGLE_NEWS_FALLBACK_URLS) {
      try {
        const xml = await fetchRssXml(gUrl);
        if (looksLikeCloudflareBlock(xml)) {
          gErr = `Google RSS נחסם Cloudflare (${gUrl})`;
          continue;
        }
        const parsed = parseRssItemsServer(xml);
        const prepared = prepareGoogleNewsFeedItems(parsed);
        if (prepared.length) {
          items = prepared;
          feedUrlUsed = gUrl;
          gErr = '';
          flashersSource = 'google_news_rss';
          break;
        }
        gErr = `Google RSS ריק (${gUrl})`;
      } catch (e) {
        gErr = formatNestedFetchError(e);
      }
    }
    if (!items.length && gErr) {
      rssAttemptError = [rssAttemptError, gErr].filter(Boolean).join(' | ');
    }
  }

  if (!items.length) {
    throw new Error(
      rssAttemptError ||
        'לא ניתן לטעון Daily Star (RSS חסום Cloudflare וגם Google News לא החזיר פריטים)',
    );
  }

  const first = items[0];
  const hero = {
    title: first.title || '',
    fullTitle: first.title || '',
    titleTranslations: { he: '', ar: '' },
    subTitle: stripSeriesTitle(first.description || '').slice(0, 400) || '',
    subTitleTranslations: { he: '', ar: '' },
    imageUrl: first.imageUrl || '',
    articleUrl: first.link || null,
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
      rssUrl: feedUrlUsed || explicitRss || null,
      rssExplicit: Boolean(explicitRss),
      googleNewsFallback: flashersSource === 'google_news_rss',
      homepageHtmlUsed: flashersSource === 'homepage_html',
      homepageAttemptError: homepageAttemptError || null,
      flashersSource,
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      rssFetchError: rssAttemptError || null,
      flashersTranslateErrorsSample,
    },
  };
}
