/**
 * Asharq Al-Awsat — דף הבית חסום לעיתים ב־Cloudflare מהשרת.
 * משתמשים ב־Google News RSS (ערבית) + תרגום ל־he/en.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const AAWSAT_HOME_URL = 'https://aawsat.com/';

export const GOOGLE_NEWS_AAWSAT_RSS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:aawsat.com+when:7d') +
  '&hl=ar&gl=SA&ceid=SA:ar';

async function fetchRssText(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'ar-SA,ar;q=0.9,en;q=0.5',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return text;
}

function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 2500).toLowerCase();
  return t.includes('just a moment') || t.includes('cloudflare') || t.includes('cf-chl');
}

function parsePubDateMs(pubDate) {
  const ms = Date.parse(String(pubDate || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

function stripAawsatGoogleTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*الشرق الأوسط\s*$/u, '')
    .replace(/\s*-\s*Asharq Al-Awsat\s*$/i, '')
    .trim();
}

function isJunkAawsatGoogleTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^الشرق الأوسط$/u.test(t)) return true;
  if (/^asharq al-awsat$/i.test(t)) return true;
  return false;
}

function prepareAawsatGoogleNewsItems(items, { maxAgeMs = 45 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripAawsatGoogleTitle(it.title);
    if (isJunkAawsatGoogleTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link) continue;
    cleaned.push({
      ...it,
      title: stripped,
      description: stripAawsatGoogleTitle(it.description),
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

/** @typedef {{ homeUrl?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} AawsatNewsPayloadOptions */

/**
 * @param {AawsatNewsPayloadOptions=} opts
 */
export async function buildAawsatNewsPayload(opts = {}) {
  const {
    homeUrl = AAWSAT_HOME_URL,
    flashersLimit = 40,
    translateLangs = ['he', 'en'],
    translateFlashers = true,
  } = opts;

  let items = [];
  try {
    const rssXml = await fetchRssText(GOOGLE_NEWS_AAWSAT_RSS);
    if (looksLikeCloudflareBlock(rssXml)) throw new Error('Google RSS blocked');
    items = prepareAawsatGoogleNewsItems(parseRssItemsServer(rssXml));
    if (!items.length) throw new Error('Google News RSS ריק אחרי סינון');
  } catch (e) {
    throw new Error(String(e?.message || e));
  }

  const heroItem = items[0];
  const hero = {
    title: heroItem.title || '',
    fullTitle: heroItem.title || '',
    titleTranslations: {},
    subTitle: heroItem.description || '',
    subTitleTranslations: {},
    imageUrl: heroItem.imageUrl || null,
    articleUrl: heroItem.link || null,
  };

  const limit = Math.min(120, Math.max(0, flashersLimit));
  let flashers = items
    .slice(1, limit + 8)
    .map((it) => ({
      title: it.title || '',
      articleUrl: it.link || null,
      imageUrl: it.imageUrl || null,
    }))
    .filter((it) => it.title && it.articleUrl)
    .filter((it) => it.articleUrl !== hero.articleUrl)
    .slice(0, limit);

  const to = (translateLangs || []).filter((l) => l && l !== 'ar');
  let titleTranslations = {};
  let subTitleTranslations = {};
  let translateErrors = {};
  let subtitleTranslateErrors = {};
  let flashersTranslateErrorsSample = [];

  if (to.length) {
    const tr = await translateOneToMany(hero.title, { from: 'ar', to: to });
    titleTranslations = tr.translations || {};
    translateErrors = tr.errors || {};

    const sub = String(hero.subTitle || '').trim();
    if (sub) {
      const subTr = await translateOneToMany(sub, { from: 'ar', to: to });
      subTitleTranslations = subTr.translations || {};
      subtitleTranslateErrors = subTr.errors || {};
    }

    let fl = flashers;
    if (translateFlashers && fl.length) {
      const titles = fl.map((f) => f.title);
      const { map: flasherMap, errors: flasherErrs } = await translateManyStrings(titles, {
        from: 'ar',
        to,
        concurrency: 5,
      });
      fl = fl.map((f) => ({
        ...f,
        titleTranslations: flasherMap.get(String(f.title || '').trim()) || {},
      }));
      flashersTranslateErrorsSample = flasherErrs.slice(0, 12);
    }
    flashers = fl;

    hero.titleTranslations = titleTranslations;
    hero.subTitleTranslations = subTitleTranslations;
  }

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrl,
      googleNewsRssUrl: GOOGLE_NEWS_AAWSAT_RSS,
      flashersSource: 'google_news_rss',
      flashersReturned: flashers.length,
      note:
        'דף aawsat.com חסום לעיתים ב־Cloudflare מהשרת; הנתונים מגיעים מ־Google News (הקישור לרוב הוא Google, לא ישיר לאתר).',
      translateLangs: to,
      translateFlashers: to.length ? translateFlashers : null,
      translateProvider: to.length ? 'google_unofficial' : null,
      translateErrors,
      subtitleTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}
