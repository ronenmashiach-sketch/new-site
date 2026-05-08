/**
 * IRNA — סקריפינג דף הבית בלבד (ללא RSS): קישורי /news/<id>/ מתוך <a>,
 * תמונה מהקשר לפני הקישור. ניסיון כתובות נוספים אם דף ברירת המחדל ריק או חסום.
 *
 * רשת: `fetch` של Node לעיתים נכשל ("fetch failed") בגלל timeout קצר או IPv6 —
 * יש גיבוי HTTPS ידני עם IPv4 + SNI.
 */

import {
  fetchWithRetries as fetchWithRetriesIpv4,
  formatNestedFetchError as formatIrnaFetchError,
} from '@/utils/serverFetchIpv4';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';

export const IRNA_HOME_URL = 'https://en.irna.ir/';

/** כתובות דף באנגלית לפי סדר ניסיון */
const HOME_SCRAPE_CANDIDATES = ['https://en.irna.ir/', 'https://www.irna.ir/en/', 'https://www.irna.ir/en'];

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const CACHE_TTL_MS = 60 * 1000;

const cache = new Map();

export { formatIrnaFetchError };

function pickUa() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] || 'Mozilla/5.0';
}

function buildIrnaRequestHeaders() {
  return {
    ...FETCH_HEADERS,
    'User-Agent': pickUa(),
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    Connection: 'close',
  };
}

async function fetchWithRetries(url, tries = 5) {
  return fetchWithRetriesIpv4(url, tries, buildIrnaRequestHeaders());
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

function looksLikeBlocked(html) {
  const h = String(html || '');
  return (
    /Human Verification|Access Denied|blocked you|security service|ACCESS DENIED/i.test(h) ||
    /awsWafCookieDomainList|gokuProps|infoblox-block-page/i.test(h) ||
    /smart-proxy\/resources/i.test(h)
  );
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&(amp|quot|apos|lt|gt);/gi, (_, name) => {
      const n = name.toLowerCase();
      if (n === 'amp') return '&';
      if (n === 'quot') return '"';
      if (n === 'apos') return "'";
      if (n === 'lt') return '<';
      if (n === 'gt') return '>';
      return _;
    });
}

function absoluteUrl(base, href) {
  try {
    return new URL(String(href || '').trim(), String(base || '').trim()).toString();
  } catch {
    return null;
  }
}

/** רק כתבות אנגליות סטנדרטיות ב־IRNA */
function normalizeIrnaArticleUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    const host = u.hostname.toLowerCase();
    if (host !== 'irna.ir' && !host.endsWith('.irna.ir')) return null;
    if (!/\/news\/\d+\//i.test(u.pathname)) return null;
    u.protocol = 'https:';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function articleIdFromUrl(url) {
  try {
    const m = String(url).match(/\/news\/(\d+)\//i);
    return m?.[1] || '';
  } catch {
    return '';
  }
}

function titleFromAnchorInner(innerHtml) {
  const alt = innerHtml.match(/\balt=["']([^"']+)["']/i);
  if (alt?.[1]?.trim()) {
    const t = decodeHtmlEntities(stripTags(alt[1])).trim();
    if (t.length >= 8) return t;
  }
  const text = decodeHtmlEntities(stripTags(innerHtml));
  return text.replace(/\s+/g, ' ').trim();
}

function findNearestImageSrc(html, anchorIndex, baseUrl) {
  const slice = html.slice(Math.max(0, anchorIndex - 2800), anchorIndex);
  let best = null;
  for (const m of slice.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)) {
    const u = m[1];
    if (!u || u.startsWith('data:')) continue;
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) || /\/image\/|\/photo\/|cdn/i.test(u)) {
      const abs = absoluteUrl(baseUrl, u);
      if (abs) best = abs;
    }
  }
  return best;
}

/**
 * חילוץ כרטיסי חדשות מדף הבית — סדר המופעים ב־HTML הוא סדר הקריאה (מוביל ראשון).
 */
export function extractIrnaNewsCardsFromHtml(html, baseUrl) {
  const h = String(html || '');
  const cards = [];
  const seen = new Set();

  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(h)) !== null) {
    const attrs = m[1];
    const inner = m[2];
    const hm = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hm) continue;

    const articleUrl = normalizeIrnaArticleUrl(hm[1], baseUrl);
    if (!articleUrl) continue;

    const id = articleIdFromUrl(articleUrl);
    if (!id || seen.has(id)) continue;

    const title = titleFromAnchorInner(inner);
    if (!title || title.length < 8) continue;

    seen.add(id);
    const imageUrl = findNearestImageSrc(h, m.index, baseUrl);

    cards.push({
      title,
      articleUrl,
      imageUrl: imageUrl || null,
    });
  }

  return cards;
}

function uniqueHomeCandidates(primary) {
  const norm = (u) =>
    String(u || '')
      .trim()
      .replace(/\/+$/, '') || IRNA_HOME_URL.replace(/\/+$/, '');
  const seen = new Set();
  const list = [];
  for (const raw of [primary, ...HOME_SCRAPE_CANDIDATES]) {
    const n = norm(raw);
    if (seen.has(n)) continue;
    seen.add(n);
    list.push(n.endsWith('/') ? n : `${n}/`);
  }
  return list;
}

/**
 * @returns {{ html: string, finalUrl: string, cards: ReturnType<typeof extractIrnaNewsCardsFromHtml> }}
 */
async function scrapeIrnaHomepages(primaryHomeUrl) {
  const cacheKey = `irna_scrape_v2_${primaryHomeUrl}`;
  const cached = cacheGet(cacheKey);
  if (cached?.cards?.length) return cached;

  let lastDetail = '';
  const urls = uniqueHomeCandidates(primaryHomeUrl);

  for (const url of urls) {
    try {
      const r = await fetchWithRetries(url, 5);
      const html = r.text || '';
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (looksLikeBlocked(html)) throw new Error('דף חסום או תוכן שגוי (בוט/ארגון)');

      const base = r.url || url;
      const cards = extractIrnaNewsCardsFromHtml(html, base);
      if (!cards.length) {
        lastDetail = `לא נמצאו קישורי /news/ בדף ${url}`;
        continue;
      }

      const out = { html, finalUrl: base, cards };
      cacheSet(cacheKey, out, CACHE_TTL_MS);
      return out;
    } catch (e) {
      lastDetail = String(e?.message || e);
    }
  }

  throw new Error(lastDetail || 'לא ניתן לסקרייפ IRNA מדף הבית');
}

/**
 * @typedef {{
 *   homeUrl?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} IrnaNewsPayloadOptions
 */

/**
 * @param {IrnaNewsPayloadOptions=} opts
 */
export async function buildIrnaNewsPayload(opts = {}) {
  const homeUrl = (opts.homeUrl && String(opts.homeUrl).trim()) || IRNA_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'ar'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsAr = translateLangs.includes('ar');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsAr ? ['ar'] : [])];

  let cards = [];
  let finalHomeUrl = homeUrl;

  const bundle = await scrapeIrnaHomepages(homeUrl);
  cards = bundle.cards;
  finalHomeUrl = bundle.finalUrl;

  const primary = cards[0];
  const rest = cards.slice(1, 1 + limit);

  const hero = {
    title: primary.title || '',
    fullTitle: primary.title || '',
    titleTranslations: { he: '', ar: '' },
    subTitle: '',
    subTitleTranslations: { he: '', ar: '' },
    imageUrl: primary.imageUrl || '',
    articleUrl: primary.articleUrl || null,
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

  let flashers = rest.map((it) => ({
    title: it.title || '',
    articleUrl: it.articleUrl || null,
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
      homepageUrl: finalHomeUrl,
      scrapePrimaryRequested: homeUrl,
      flashersSource: 'irna_homepage_html_scrape',
      articlesParsed: cards.length,
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}
