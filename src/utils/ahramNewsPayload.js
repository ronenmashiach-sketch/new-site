/**
 * Ahram English — שליפת דף הבית + תרגום (ללא כתיבת CSV; ה־route קורא ל־sync).
 */

/** @typedef {{ homeUrl?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} AhramNewsPayloadOptions */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';

export const AHRAM_HOME_URL = 'https://english.ahram.org.eg/';

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
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAbsUrl(baseUrl, maybeRelative) {
  const s = String(maybeRelative || '').trim();
  if (!s) return null;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractHeroBlock(html) {
  const start = html.toLowerCase().indexOf("<h1 class='title'");
  if (start < 0) return null;
  const chunk = html.slice(start, start + 25000);

  const a = chunk.match(/<h1[^>]*class='title'[^>]*>[\s\S]*?<a[^>]+href='([^']+)'[^>]*>([\s\S]*?)<\/a>/i);
  if (!a) return null;

  const href = a[1];
  const title = decodeHtmlEntities(stripTags(a[2]));

  const p = chunk.match(/<\/h1>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  const subTitle = p ? decodeHtmlEntities(stripTags(p[1])) : '';

  const imgs = [...chunk.matchAll(/<img[^>]+src='([^']+)'/gi)].map((m) => m[1]);
  const heroImg =
    imgs.find((src) => src && !src.includes('icon-weekly') && /\/?Media\/News\//i.test(src)) || null;

  return { title, subTitle, href, heroImg };
}

function extractFlashers(html, baseUrl, heroAbsUrl, limit) {
  const links = [...html.matchAll(/<a[^>]+href='(NewsContent\/[^']+)'[^>]*>([\s\S]*?)<\/a>/gi)];
  const out = [];
  const seen = new Set();

  for (const m of links) {
    const abs = toAbsUrl(baseUrl, m[1]);
    if (!abs) continue;
    if (abs === heroAbsUrl) continue;
    if (seen.has(abs)) continue;
    const title = decodeHtmlEntities(stripTags(m[2]));
    if (!title) continue;
    seen.add(abs);
    out.push({ title, articleUrl: abs });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Homepage HTTP ${res.status}`);
  return res.text();
}

/**
 * @param {AhramNewsPayloadOptions=} opts
 */
export async function buildAhramNewsPayload(opts = {}) {
  const {
    homeUrl = AHRAM_HOME_URL,
    flashersLimit = 40,
    translateLangs = ['he', 'ar'],
    translateFlashers = true,
  } = opts;

  const html = await fetchHtml(homeUrl);
  const heroBlock = extractHeroBlock(html);
  if (!heroBlock) {
    throw new Error('לא הצלחתי לזהות כותרת ראשית בדף הבית');
  }

  const articleUrl = toAbsUrl(homeUrl, heroBlock.href);
  const imageUrl = toAbsUrl(homeUrl, heroBlock.heroImg);
  const flashers = extractFlashers(html, homeUrl, articleUrl, Math.min(120, Math.max(0, flashersLimit)));

  const hero = {
    title: heroBlock.title,
    fullTitle: heroBlock.title,
    titleTranslations: {},
    subTitle: heroBlock.subTitle,
    subTitleTranslations: {},
    imageUrl,
    articleUrl,
  };

  let titleTranslations = {};
  let subTitleTranslations = {};
  let translateErrors = {};
  let subtitleTranslateErrors = {};
  let flashersTranslateErrorsSample = [];

  const to = (translateLangs || []).filter((l) => l && l !== 'en');

  if (to.length) {
    const tr = await translateOneToMany(hero.title, { from: 'en', to: to });
    titleTranslations = tr.translations || {};
    translateErrors = tr.errors || {};

    const sub = String(heroBlock.subTitle || '').trim();
    if (sub) {
      const subTr = await translateOneToMany(sub, { from: 'en', to: to });
      subTitleTranslations = subTr.translations || {};
      subtitleTranslateErrors = subTr.errors || {};
    }

    let fl = flashers;
    if (translateFlashers && fl.length) {
      const titles = fl.map((f) => f.title);
      const { map: flasherMap, errors: flasherErrs } = await translateManyStrings(titles, {
        from: 'en',
        to,
        concurrency: 5,
      });
      fl = fl.map((f) => ({
        ...f,
        titleTranslations: flasherMap.get(String(f.title || '').trim()) || {},
      }));
      flashersTranslateErrorsSample = flasherErrs.slice(0, 12);
    }

    hero.titleTranslations = titleTranslations;
    hero.subTitleTranslations = subTitleTranslations;

    return {
      hero,
      flashers: fl,
      meta: {
        homepageUrl: homeUrl,
        method: 'homepage_scrape',
        flashersReturned: fl.length,
        translateLangs: to,
        translateFlashers: to.length ? translateFlashers : null,
        translateProvider: to.length ? 'google_unofficial' : null,
        translateErrors,
        subtitleTranslateErrors,
        flashersTranslateErrorsSample,
      },
    };
  }

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrl,
      method: 'homepage_scrape',
      flashersReturned: flashers.length,
      translateLangs: [],
      translateFlashers: null,
      translateProvider: null,
      translateErrors: {},
      subtitleTranslateErrors: {},
      flashersTranslateErrorsSample: [],
    },
  };
}
