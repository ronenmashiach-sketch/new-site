/**
 * The National (thenationalnews.com) — עדיפות לסקרייפ דף הבית (אין RSS ציבורי ברור).
 * Fallback: Google News אם הדף חסום או הפרסור נכשל.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const NATIONAL_HOME_URL = 'https://www.thenationalnews.com/';

export const GOOGLE_NEWS_NATIONAL_RSS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:thenationalnews.com+when:7d') +
  '&hl=en&gl=US&ceid=US:en';

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

function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 2500).toLowerCase();
  return t.includes('just a moment') || t.includes('cloudflare') || t.includes('cf-chl');
}

function toAbsUrl(baseUrl, path) {
  const p = String(path || '').trim();
  if (!p) return null;
  try {
    return new URL(p, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeImgUrl(raw) {
  const s = decodeHtmlEntities(String(raw || '').trim());
  return s || null;
}

function stripTags(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * כותרת ראשית אמיתית — בלוק splash למעלה (לא הקרוסלה שמופיעה קודם ב־DOM).
 */
function extractSplashHero(html, baseUrl) {
  const marker = 'data-identifier="splash-card"';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  const slice = html.slice(idx, idx + 20000);

  const linkWithLabel = slice.match(
    /<a href="(\/[a-zA-Z0-9/-]+\/\d{4}\/\d{2}\/\d{2}\/[^"]+\/)"[^>]*aria-label="([^"]+)"/i
  );
  let path = linkWithLabel?.[1];
  let title = linkWithLabel?.[2] ? decodeHtmlEntities(linkWithLabel[2]).trim() : '';

  if (!path) {
    const linkOnly = slice.match(
      /<a href="(\/[a-zA-Z0-9/-]+\/\d{4}\/\d{2}\/\d{2}\/[^"]+\/)"[^>]*>/i
    );
    path = linkOnly?.[1];
  }

  if (!path) return null;

  if (!title) {
    const h4 = slice.match(
      /<p class="[^"]*Headline[^"]*b-h4[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    if (h4) title = decodeHtmlEntities(stripTags(h4[1]));
  }

  title = String(title || '').trim();
  if (!title) return null;

  const stand = slice.match(/class="[^"]*b-standfirst[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  const subTitle = stand ? decodeHtmlEntities(stripTags(stand[1])) : '';

  const imgM = slice.match(/<img[^>]+src="([^"]+)"/i);
  const imageUrl = normalizeImgUrl(imgM?.[1]);

  return {
    title,
    subTitle,
    articleUrl: toAbsUrl(baseUrl, path),
    imageUrl,
  };
}

/**
 * כותרות מכרטיסי מדיה בדף הבית (מבנה מ־StyledHeadline).
 */
function extractHomepageCards(html, baseUrl) {
  const headlineRe =
    /<a href="(\/[a-zA-Z0-9/-]+\/\d{4}\/\d{2}\/\d{2}\/[^"]+\/)"[^>]*>\s*<p class="[^"]*Headline[^"]*"[^>]*>([\s\S]*?)<\/p>\s*<\/a>/gi;

  const out = [];
  const seen = new Set();
  let m;
  while ((m = headlineRe.exec(html)) !== null) {
    const path = m[1];
    if (path.includes('/quiz-of-the-week')) continue;
    let title = m[2].replace(/<[^>]+>/g, ' ');
    title = decodeHtmlEntities(title).replace(/\s+/g, ' ').trim();
    if (!title || seen.has(path)) continue;
    seen.add(path);

    const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const imgRe = new RegExp(
      `<a href="${esc}"[^>]*>[\\s\\S]*?<img[^>]+src="([^"]+)"`,
      'i'
    );
    const im = html.match(imgRe);
    const imageUrl = normalizeImgUrl(im?.[1]);

    out.push({
      title,
      articleUrl: toAbsUrl(baseUrl, path),
      imageUrl,
    });
  }
  return out;
}

async function fetchHomepageHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-GB,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Homepage HTTP ${res.status}`);
  return res.text();
}

async function fetchRssText(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return text;
}

function parsePubDateMs(pubDate) {
  const ms = Date.parse(String(pubDate || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

function stripNationalGoogleTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*The National\s*$/i, '')
    .trim();
}

function isJunkNationalGoogleTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^the national$/i.test(t)) return true;
  return false;
}

function prepareNationalGoogleItems(items, { maxAgeMs = 45 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripNationalGoogleTitle(it.title);
    if (isJunkNationalGoogleTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link) continue;
    cleaned.push({
      ...it,
      title: stripped,
      description: stripNationalGoogleTitle(it.description),
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

async function loadFromGoogleNews(flashersLimit) {
  const rssXml = await fetchRssText(GOOGLE_NEWS_NATIONAL_RSS);
  if (looksLikeCloudflareBlock(rssXml)) throw new Error('Google RSS blocked');
  const raw = parseRssItemsServer(rssXml);
  const items = prepareNationalGoogleItems(raw);
  if (!items.length) throw new Error('Google News RSS ריק אחרי סינון');

  const limit = Math.min(120, Math.max(0, flashersLimit));
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
  const flashers = items
    .slice(1, limit + 8)
    .map((it) => ({
      title: it.title || '',
      articleUrl: it.link || null,
      imageUrl: it.imageUrl || null,
    }))
    .filter((it) => it.title && it.articleUrl)
    .filter((it) => it.articleUrl !== hero.articleUrl)
    .slice(0, limit);

  return {
    hero,
    flashers,
    meta: {
      googleNewsRssUrl: GOOGLE_NEWS_NATIONAL_RSS,
      flashersSource: 'google_news_rss',
      flashersReturned: flashers.length,
      note: 'נתונים מ־Google News (האתר לא נטען או לא נפרס).',
    },
  };
}

/** @typedef {{ homeUrl?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} NationalNewsPayloadOptions */

/**
 * @param {NationalNewsPayloadOptions=} opts
 */
export async function buildNationalNewsPayload(opts = {}) {
  const {
    homeUrl = NATIONAL_HOME_URL,
    flashersLimit = 40,
    translateLangs = ['he', 'ar'],
    translateFlashers = true,
  } = opts;

  const limit = Math.min(120, Math.max(0, flashersLimit));
  let hero;
  let flashers;
  let baseMeta;

  try {
    const html = await fetchHomepageHtml(homeUrl);
    if (looksLikeCloudflareBlock(html)) {
      throw new Error('Cloudflare block on homepage');
    }

    const splash = extractSplashHero(html, homeUrl);
    const cards = extractHomepageCards(html, homeUrl);
    if (!splash && !cards.length) throw new Error('לא נמצאו כתבות בדף הבית');

    if (splash && splash.articleUrl) {
      hero = {
        title: splash.title,
        fullTitle: splash.title,
        titleTranslations: {},
        subTitle: splash.subTitle,
        subTitleTranslations: {},
        imageUrl: splash.imageUrl,
        articleUrl: splash.articleUrl,
      };
      const heroPath = new URL(splash.articleUrl).pathname.replace(/\/$/, '');
      flashers = cards
        .filter((c) => {
          try {
            const p = new URL(c.articleUrl).pathname.replace(/\/$/, '');
            return p !== heroPath;
          } catch {
            return true;
          }
        })
        .slice(0, limit)
        .map((c) => ({
          title: c.title,
          articleUrl: c.articleUrl,
          imageUrl: c.imageUrl,
        }));
    } else {
      const [first, ...rest] = cards;
      hero = {
        title: first.title,
        fullTitle: first.title,
        titleTranslations: {},
        subTitle: '',
        subTitleTranslations: {},
        imageUrl: first.imageUrl,
        articleUrl: first.articleUrl,
      };
      flashers = rest
        .filter((c) => c.articleUrl !== hero.articleUrl)
        .slice(0, limit)
        .map((c) => ({
          title: c.title,
          articleUrl: c.articleUrl,
          imageUrl: c.imageUrl,
        }));
    }

    baseMeta = {
      flashersSource: 'homepage_scrape',
      flashersReturned: flashers.length,
      googleNewsRssUrl: GOOGLE_NEWS_NATIONAL_RSS,
    };
  } catch {
    const g = await loadFromGoogleNews(limit);
    hero = g.hero;
    flashers = g.flashers;
    baseMeta = g.meta;
  }

  const to = (translateLangs || []).filter((l) => l && l !== 'en');
  let titleTranslations = {};
  let subTitleTranslations = {};
  let translateErrors = {};
  let subtitleTranslateErrors = {};
  let flashersTranslateErrorsSample = [];

  if (to.length) {
    const tr = await translateOneToMany(hero.title, { from: 'en', to: to });
    titleTranslations = tr.translations || {};
    translateErrors = tr.errors || {};

    const sub = String(hero.subTitle || '').trim();
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
    flashers = fl;

    hero.titleTranslations = titleTranslations;
    hero.subTitleTranslations = subTitleTranslations;
  }

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrl,
      ...baseMeta,
      translateLangs: to,
      translateFlashers: to.length ? translateFlashers : null,
      translateProvider: to.length ? 'google_unofficial' : null,
      translateErrors,
      subtitleTranslateErrors,
      flashersTranslateErrorsSample,
    },
  };
}
