/**
 * WAFA — כותרות וקישורים מ־www.wafa.ps (ערבית). עברית ואנגלית: תרגום מכונה מערבית (Google לא רשמי),
 * כי רשימות "אחרונים" באנגלית/עברית באורך ובסדר שונים — אי־אפשר ליישר לפי אינדקס מול הערבית.
 *
 * כותרות דמוי Chrome (Accept, Referer, sec-ch-ua, sec-fetch-*). אופציונלי: `WAFA_COOKIE` מסביבה.
 * זיהוי Cloudflare: לא מספיק המחרוזת "cloudflare" (מופיעה ב־cdnjs.cloudflare.com וכו').
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

export const WAFA_AR_HOME_URL = 'https://www.wafa.ps/';
export const WAFA_HE_HOME_URL = 'https://hebrew.wafa.ps/';
export const WAFA_EN_HOME_URL = 'https://english.wafa.ps/';

function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name.toLowerCase()] || m);
}

function stripTags(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function originFromHomeUrl(homeUrl) {
  try {
    return new URL(homeUrl).origin;
  } catch {
    return 'https://www.wafa.ps';
  }
}

function isWafaArticleHref(hrefRaw) {
  const p = String(hrefRaw || '').trim();
  if (!p.startsWith('/')) return false;
  return /^\/(news\/|video\/|Pages\/Details\/)/i.test(p);
}

function absolutize(origin, pathOrUrl) {
  const p = String(pathOrUrl || '').trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('//')) return `https:${p}`;
  return origin + (p.startsWith('/') ? p : `/${p}`);
}

/**
 * סליידים מהקרוסלה הראשית (כותרת + קישור + תמונה).
 * @param {string} html
 * @param {string} homeUrl
 * @returns {{ articleUrl: string, imageUrl: string, title: string }[]}
 */
export function extractWafaCarouselSlides(html, homeUrl) {
  const origin = originFromHomeUrl(homeUrl);
  const out = [];
  const seen = new Set();
  const anchor = '<a style="width: 100%;" href="';
  let pos = 0;
  while (pos < html.length) {
    const rel = html.indexOf(anchor, pos);
    if (rel < 0) break;
    const hrefStart = rel + anchor.length;
    const hrefEnd = html.indexOf('"', hrefStart);
    if (hrefEnd < 0) break;
    const hrefRaw = html.slice(hrefStart, hrefEnd);
    if (!isWafaArticleHref(hrefRaw)) {
      pos = hrefEnd + 1;
      continue;
    }
    const imgEndMarker = html.indexOf('<!-- Image END -->', hrefEnd);
    if (imgEndMarker < 0 || imgEndMarker - hrefEnd > 12000) {
      pos = hrefEnd + 1;
      continue;
    }
    const chunk = html.slice(hrefEnd + 1, imgEndMarker);
    const imgM = chunk.match(/<img[^>]*class="[^"]*d-block w-100 main[^"]*"[^>]*src="([^"]+)"/i);
    if (!imgM) {
      pos = imgEndMarker + 1;
      continue;
    }
    const titleZone = html.slice(imgEndMarker, imgEndMarker + 2000);
    const titles = [];
    const titRe = /<h4 class="titlevideo"><a href="[^"]+">([^<]+)<\/a>/gi;
    let tm;
    while ((tm = titRe.exec(titleZone)) !== null) {
      const t = decodeHtmlEntities(stripTags(tm[1])).trim();
      if (t) titles.push(t);
    }
    const title = titles.length ? titles.reduce((a, b) => (b.length > a.length ? b : a), titles[0]) : '';
    const articleUrl = absolutize(origin, hrefRaw);
    const imageUrl = absolutize(origin, imgM[1].trim());
    const key = articleUrl.split('?')[0];
    if (title && !seen.has(key)) {
      seen.add(key);
      out.push({ articleUrl, imageUrl, title });
    }
    pos = imgEndMarker + 1;
  }
  return out;
}

/**
 * כותרות מ"אחרונים" (#latest-news).
 * @param {string} html
 * @param {string} homeUrl
 * @param {number} limit
 */
export function extractWafaLatestNews(html, homeUrl, limit) {
  const origin = originFromHomeUrl(homeUrl);
  const idx = html.indexOf('id="latest-news"');
  if (idx < 0) return [];
  const slice = html.slice(idx, idx + 120000);
  const re = /<a class="latestnews" href="([^"]+)">([^<]*)<\/a>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(slice)) !== null) {
    const articleUrl = absolutize(origin, m[1].trim());
    const title = decodeHtmlEntities(stripTags(m[2])).trim();
    const key = articleUrl.split('?')[0];
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ articleUrl, title, imageUrl: '' });
    if (out.length >= limit) break;
  }
  return out;
}

/** דף אתגר Cloudflare — לא קישורי CDN תמימים כמו cdnjs.cloudflare.com */
function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 14000).toLowerCase();
  if (t.includes('just a moment')) return true;
  if (t.includes('cf-chl')) return true;
  if (t.includes('/cdn-cgi/challenge-platform/')) return true;
  if (t.includes('challenges.cloudflare.com')) return true;
  if (t.includes('checking your browser before accessing')) return true;
  if (t.includes('cf-turnstile')) return true;
  return false;
}

/** כותרות דמוי Chrome — עוזר מול WAF / ASP.NET (כמו בקשת curl אמיתית). */
function buildWafaFetchHeaders(url) {
  const u = String(url || '').toLowerCase();
  const isEn = u.includes('english.wafa');
  const isHe = u.includes('hebrew.wafa');
  let acceptLang = 'ar,ar-SA;q=0.9,en-US;q=0.8,en;q=0.7';
  if (isEn) acceptLang = 'en-US,en;q=0.9,he;q=0.8';
  if (isHe) acceptLang = 'he,en-US;q=0.9,ar;q=0.8';

  let referer = url;
  try {
    const o = new URL(url);
    referer = `${o.origin}/`;
  } catch {
    /* keep url */
  }

  const cookie = typeof process !== 'undefined' && process.env?.WAFA_COOKIE?.trim();
  const headers = {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': acceptLang,
    'Cache-Control': 'max-age=0',
    Referer: referer,
    'Upgrade-Insecure-Requests': '1',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
  };
  if (cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

async function fetchHomepageHtml(url) {
  const res = await fetch(url, {
    headers: buildWafaFetchHeaders(url),
    cache: 'no-store',
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`WAFA homepage HTTP ${res.status}`);
  return res.text();
}

/**
 * @typedef {{
 *   homeUrlAr?: string,
 *   homeUrlHe?: string,
 *   homeUrlEn?: string,
 *   flashersLimit?: number,
 *   translateLangs?: string[],
 *   translateFlashers?: boolean,
 * }} WafaNewsPayloadOptions
 */

/**
 * @param {WafaNewsPayloadOptions=} opts
 */
export async function buildWafaNewsPayload(opts = {}) {
  const homeUrlAr = (opts.homeUrlAr && String(opts.homeUrlAr).trim()) || WAFA_AR_HOME_URL;
  const homeUrlHe = (opts.homeUrlHe && String(opts.homeUrlHe).trim()) || WAFA_HE_HOME_URL;
  const homeUrlEn = (opts.homeUrlEn && String(opts.homeUrlEn).trim()) || WAFA_EN_HOME_URL;
  const limit = Math.min(120, Math.max(0, Number(opts.flashersLimit) || 40));
  const translateLangs = Array.isArray(opts.translateLangs) ? opts.translateLangs : ['he', 'en'];
  const translateFlashers = opts.translateFlashers !== false;
  const wantsHe = translateLangs.includes('he');
  const wantsEn = translateLangs.includes('en');
  const tlTargets = [...(wantsHe ? ['he'] : []), ...(wantsEn ? ['en'] : [])];

  const htmlAr = await fetchHomepageHtml(homeUrlAr.endsWith('/') ? homeUrlAr : `${homeUrlAr}/`);
  if (looksLikeCloudflareBlock(htmlAr)) throw new Error('Cloudflare block on WAFA Arabic homepage');

  const slidesAr = extractWafaCarouselSlides(htmlAr, homeUrlAr);
  if (!slidesAr.length) throw new Error('לא נמצאו סליידים בקרוסלת WAFA (ערבית)');

  const heroAr = slidesAr[0];

  const hero = {
    title: heroAr.title,
    fullTitle: heroAr.title,
    titleTranslations: { he: '', en: '' },
    subTitle: '',
    subTitleTranslations: { he: '', en: '' },
    imageUrl: heroAr.imageUrl || '',
    articleUrl: heroAr.articleUrl,
  };

  let heroTranslateErrors = {};
  if (tlTargets.length && String(hero.title || '').trim()) {
    try {
      const tr = await translateOneToMany(hero.title, { from: 'ar', to: tlTargets });
      if (wantsHe) hero.titleTranslations.he = tr.translations?.he || '';
      if (wantsEn) hero.titleTranslations.en = tr.translations?.en || '';
      heroTranslateErrors = tr.errors || {};
    } catch (e) {
      heroTranslateErrors = { _all: String(e?.message || e) };
    }
  }

  const latestAr = extractWafaLatestNews(htmlAr, homeUrlAr, limit);

  let flashers = latestAr.map((row) => ({
    title: row.title,
    articleUrl: row.articleUrl,
    imageUrl: row.imageUrl || null,
    titleTranslations: { he: '', en: '' },
  }));

  let flashersTranslateErrorsSample = [];
  if (tlTargets.length && translateFlashers && flashers.length) {
    const titles = flashers.map((f) => f.title);
    const { map, errors } = await translateManyStrings(titles, {
      from: 'ar',
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
          en: wantsEn ? row.en ?? '' : '',
        },
      };
    });
    flashersTranslateErrorsSample = errors.slice(0, 8);
  }

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrlAr,
      homepageHeUrl: homeUrlHe,
      homepageEnUrl: homeUrlEn,
      flashersSource: 'latest_news_ar_plus_translate_he_en',
      flashersReturned: flashers.length,
      translateLangs: tlTargets,
      translateFlashers: Boolean(tlTargets.length && translateFlashers),
      translateProvider: tlTargets.length ? 'google_unofficial' : null,
      heroTranslateErrors,
      flashersTranslateErrorsSample,
      noteArHeEnLists:
        'רשימות אחרונים באנגלית/עברית שונות באורך ובסדר מול הערבית; he/en מגיעים מתרגום מערבית.',
    },
  };
}
