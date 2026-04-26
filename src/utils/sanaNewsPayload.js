/**
 * SANA — ערבית מ־https://sana.sy/, אנגלית מטקסט האתר ב־https://sana.sy/en/ (התאמה לפי מזהה כתבה),
 * תרגום אוטומטי רק לעברית (מאנגלית כשיש התאמה, אחרת מערבית). גיבוי: RSS ערבית.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const SANA_HOME_URL = 'https://sana.sy/';

export const SANA_EN_HOME_URL = 'https://sana.sy/en/';

export const SANA_FEED_URL = 'https://sana.sy/feed/';

const SANA_HREF_RE = String.raw`(https:\/\/sana\.sy(?:\/en)?\/[^"]+)`;

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

function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 2500).toLowerCase();
  return t.includes('just a moment') || t.includes('cloudflare') || t.includes('cf-chl');
}

function extractMainInner(html) {
  const m = html.match(/<main class="site-wrap"[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : null;
}

function normalizeArticlePath(u) {
  try {
    return new URL(u).pathname.replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}

/** מזהה כתבה (מספר בסוף הנתיב) — משותף ל־/ar ו־/en. */
function getSanaPostId(url) {
  try {
    const m = String(new URL(url).pathname).match(/\/(\d+)\/?$/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function isSanaArticleUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h !== 'sana.sy' && !h.endsWith('.sana.sy')) return false;
    return /\/\d+\/?$/.test(u.pathname.replace(/\/$/, ''));
  } catch {
    return false;
  }
}

function extractHeroFromMain(mainHtml) {
  const h2re = new RegExp(
    `<h2 class="entry-title h1">\\s*<a class="p-url" href="${SANA_HREF_RE}"[^>]*>\\s*([\\s\\S]*?)<\\/a>\\s*<\\/h2>`,
    'i',
  );
  const m = mainHtml.match(h2re);
  if (!m) return null;
  const url = m[1].trim();
  if (!isSanaArticleUrl(url)) return null;

  const idx = mainHtml.search(h2re);
  const head = idx >= 0 ? mainHtml.slice(Math.max(0, idx - 6000), idx) : '';
  let imageUrl = null;
  const imgs = [...head.matchAll(/<img[^>]*\bsrc="(https:\/\/cdn\.sananews\.sy[^"]+)"/gi)];
  if (imgs.length) imageUrl = decodeHtmlEntities(imgs[imgs.length - 1][1].trim());

  const after = mainHtml.slice(idx + m[0].length, idx + m[0].length + 1200);
  const sum = after.match(/<p class="entry-summary"[^>]*>\s*([\s\S]*?)<\/p>/i);
  const subTitle = sum ? decodeHtmlEntities(stripTags(sum[1])) : '';

  return {
    articleUrl: url,
    title: decodeHtmlEntities(stripTags(m[2])),
    subTitle,
    imageUrl,
  };
}

function extractBookmarkCards(mainHtml) {
  const re = new RegExp(
    `<(?:h2|h3|p) class="entry-title[^"]*"[^>]*>\\s*<a class="p-url" href="${SANA_HREF_RE}"[^>]*rel="bookmark"[^>]*>\\s*([\\s\\S]*?)<\\/a>`,
    'gi',
  );
  const out = [];
  const seen = new Set();
  let mm;
  while ((mm = re.exec(mainHtml)) !== null) {
    const url = mm[1].trim();
    if (!isSanaArticleUrl(url)) continue;
    const title = decodeHtmlEntities(stripTags(mm[2]));
    if (!title) continue;
    const key = normalizeArticlePath(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, articleUrl: url, subTitle: '', imageUrl: null });
  }
  return out;
}

function extractHomepageBundle(html) {
  const main = extractMainInner(html);
  if (!main) return null;

  let hero = extractHeroFromMain(main);
  const cards = extractBookmarkCards(main);

  if (!hero && cards.length) {
    hero = { ...cards[0], subTitle: cards[0].subTitle || '' };
  }
  if (!hero) return null;

  const heroKey = normalizeArticlePath(hero.articleUrl);
  const flashersCandidates = cards.filter((c) => normalizeArticlePath(c.articleUrl) !== heroKey);

  return { hero, flashersCandidates };
}

/** מפת postId → כותרת ותקציר מאתר EN (או AR אם אותו מבנה). */
function buildPostIdLookup(bundle) {
  /** @type {Map<string, { title: string, subTitle: string }>} */
  const map = new Map();
  if (!bundle?.hero) return map;
  const add = (card) => {
    const id = getSanaPostId(card.articleUrl);
    if (!id || map.has(id)) return;
    map.set(id, { title: card.title, subTitle: card.subTitle || '' });
  };
  add(bundle.hero);
  (bundle.flashersCandidates || []).forEach(add);
  return map;
}

async function fetchHomepageHtml(url) {
  const isEn = /sana\.sy\/en/i.test(url);
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': isEn ? 'en-US,en;q=0.9' : 'ar,en;q=0.8',
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

function stripFeedTitle(title) {
  return String(title || '')
    .replace(/\s*[|\u2013\u2014-]\s*وكالة الأنباء السورية[\s\S]*$/u, '')
    .replace(/\s*[|\u2013\u2014-]\s*سانا\s*$/u, '')
    .replace(/\s*[-|]\s*S\s*A\s*N\s*A[\s\S]*$/iu, '')
    .trim();
}

function isJunkFeedTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^وكالة الأنباء السورية|^سانا$/u.test(t)) return true;
  return false;
}

function prepareFeedItems(items, { maxAgeMs = 45 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripFeedTitle(it.title);
    if (isJunkFeedTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link || !isSanaArticleUrl(link)) continue;
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
    const k = normalizeArticlePath(it.link);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }
  return deduped;
}

async function loadFromWordPressFeed(flashersLimit) {
  const rssXml = await fetchRssText(SANA_FEED_URL);
  if (looksLikeCloudflareBlock(rssXml)) throw new Error('RSS blocked');
  const raw = parseRssItemsServer(rssXml);
  const items = prepareFeedItems(raw);
  if (!items.length) throw new Error('RSS ריק אחרי סינון');

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
      wordpressFeedUrl: SANA_FEED_URL,
      flashersSource: 'wordpress_feed',
      flashersReturned: flashers.length,
      note: 'נתונים מ־RSS (דף הבית לא נטען או לא נפרס).',
    },
  };
}

async function translateFlasherTitlesToHe(flashers, { translateFlashers, enLookup }) {
  if (!translateFlashers || !flashers.length) return flashers;

  const CONCURRENCY = 5;
  const out = [];
  for (let i = 0; i < flashers.length; i += CONCURRENCY) {
    const batch = flashers.slice(i, i + CONCURRENCY);
        const settled = await Promise.all(
      batch.map(async (f) => {
        const id = getSanaPostId(f.articleUrl);
        const enRow = id ? enLookup.get(id) : null;
        const enTitle =
          (enRow?.title && String(enRow.title).trim()) ||
          (f.titleTranslations?.en && String(f.titleTranslations.en).trim()) ||
          '';
        const titleTranslations = { en: enTitle, he: '' };
        const src = enTitle || f.title;
        const from = enTitle ? 'en' : 'ar';
        try {
          const r = await translateOneToMany(src, { from, to: ['he'] });
          titleTranslations.he = r.translations?.he || '';
        } catch {
          /* ignore per-item */
        }
        return { ...f, titleTranslations };
      }),
    );
    out.push(...settled);
  }
  return out;
}

/** @typedef {{ homeUrl?: string, homeUrlEn?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} SanaNewsPayloadOptions */

/**
 * @param {SanaNewsPayloadOptions=} opts
 */
export async function buildSanaNewsPayload(opts = {}) {
  const {
    homeUrl = SANA_HOME_URL,
    homeUrlEn = SANA_EN_HOME_URL,
    flashersLimit = 40,
    translateLangs = ['he'],
    translateFlashers = true,
  } = opts;

  const limit = Math.min(120, Math.max(0, flashersLimit));
  const wantsHe = (translateLangs || []).includes('he');

  let hero;
  let flashers;
  let baseMeta;
  /** @type {Map<string, { title: string, subTitle: string }>} */
  let enLookup = new Map();
  /** @type {{ hero: object, flashersCandidates: object[] } | null} */
  let bundleEn = null;
  let englishHomeOk = false;

  try {
    const htmlAr = await fetchHomepageHtml(homeUrl);
    if (looksLikeCloudflareBlock(htmlAr)) {
      throw new Error('Cloudflare block on homepage');
    }
    const bundleAr = extractHomepageBundle(htmlAr);
    if (!bundleAr) throw new Error('לא נמצאו כתבות בדף הבית');

    try {
      const htmlEn = await fetchHomepageHtml(homeUrlEn);
      if (!looksLikeCloudflareBlock(htmlEn)) {
        const extractedEn = extractHomepageBundle(htmlEn);
        if (extractedEn) {
          bundleEn = extractedEn;
          enLookup = buildPostIdLookup(bundleEn);
          englishHomeOk = true;
        }
      }
    } catch {
      /* אנגלית אופציונלית */
    }

    hero = {
      title: bundleAr.hero.title,
      fullTitle: bundleAr.hero.title,
      titleTranslations: { en: '', he: '' },
      subTitle: bundleAr.hero.subTitle,
      subTitleTranslations: { en: '', he: '' },
      imageUrl: bundleAr.hero.imageUrl,
      articleUrl: bundleAr.hero.articleUrl,
    };

    const hid = getSanaPostId(hero.articleUrl);
    const enHeroById = hid ? enLookup.get(hid) : null;
    /** @type {'post_id' | 'slot' | 'none'} */
    let englishHeroMerge = 'none';
    if (enHeroById) {
      hero.titleTranslations.en = enHeroById.title;
      hero.subTitleTranslations.en = enHeroById.subTitle;
      englishHeroMerge = 'post_id';
    } else if (bundleEn?.hero) {
      /* SANA משתמשים לרוב במזהי פוסט שונים בין AR ל־EN — אין התאמה לפי מספר; משתמשים באותו "מקום" בדף הבית */
      hero.titleTranslations.en = bundleEn.hero.title;
      hero.subTitleTranslations.en = bundleEn.hero.subTitle || '';
      englishHeroMerge = 'slot';
    }

    const heroKey = normalizeArticlePath(hero.articleUrl);
    const enHeroKey = bundleEn?.hero ? normalizeArticlePath(bundleEn.hero.articleUrl) : '';
    const enFlasherSlots = bundleEn
      ? bundleEn.flashersCandidates
          .filter((c) => normalizeArticlePath(c.articleUrl) !== enHeroKey)
          .slice(0, limit)
      : [];

    flashers = bundleAr.flashersCandidates
      .filter((c) => normalizeArticlePath(c.articleUrl) !== heroKey)
      .slice(0, limit)
      .map((c, i) => {
        const id = getSanaPostId(c.articleUrl);
        const enRow = id ? enLookup.get(id) : null;
        const slot = enFlasherSlots[i];
        const enTitle =
          (enRow?.title && String(enRow.title).trim()) ||
          (slot?.title && String(slot.title).trim()) ||
          '';
        return {
          title: c.title,
          articleUrl: c.articleUrl,
          imageUrl: c.imageUrl,
          titleTranslations: { en: enTitle, he: '' },
        };
      });

    if (wantsHe) {
      const heroTitleSrc = (hero.titleTranslations.en && hero.titleTranslations.en.trim()) || hero.title;
      const heroTitleFrom = hero.titleTranslations.en?.trim() ? 'en' : 'ar';
      try {
        const tr = await translateOneToMany(heroTitleSrc, { from: heroTitleFrom, to: ['he'] });
        hero.titleTranslations.he = tr.translations?.he || '';
        hero.translateErrors = tr.errors || {};
      } catch (e) {
        hero.translateErrors = { he: String(e?.message || e) };
      }

      const subSrc =
        (hero.subTitleTranslations.en && hero.subTitleTranslations.en.trim()) || hero.subTitle;
      if (String(subSrc || '').trim()) {
        const subFrom = hero.subTitleTranslations.en?.trim() ? 'en' : 'ar';
        try {
          const subTr = await translateOneToMany(subSrc, { from: subFrom, to: ['he'] });
          hero.subTitleTranslations.he = subTr.translations?.he || '';
          hero.subtitleTranslateErrors = subTr.errors || {};
        } catch (e) {
          hero.subtitleTranslateErrors = { he: String(e?.message || e) };
        }
      }

      flashers = await translateFlasherTitlesToHe(flashers, {
        translateFlashers,
        enLookup,
      });
    }

    baseMeta = {
      wordpressFeedUrl: SANA_FEED_URL,
      homepageEnUrl: homeUrlEn,
      englishHomeScraped: englishHomeOk,
      englishHeroMerge,
      flashersSource: 'homepage_ar_plus_en',
      flashersReturned: flashers.length,
    };
  } catch {
    const g = await loadFromWordPressFeed(limit);
    hero = g.hero;
    flashers = g.flashers;
    baseMeta = g.meta;

    if (wantsHe) {
      try {
        const tr = await translateOneToMany(hero.title, { from: 'ar', to: ['he'] });
        hero.titleTranslations = { ...(hero.titleTranslations || {}), he: tr.translations?.he || '' };
      } catch {
        /* ignore */
      }
      if (translateFlashers && flashers.length) {
        const titles = flashers.map((f) => f.title);
        const { map: flasherMap } = await translateManyStrings(titles, { from: 'ar', to: ['he'], concurrency: 5 });
        flashers = flashers.map((f) => ({
          ...f,
          titleTranslations: { ...(f.titleTranslations || {}), he: flasherMap.get(String(f.title || '').trim())?.he || '' },
        }));
      }
    }
  }

  let translateErrors = hero.translateErrors || {};
  const subtitleTranslateErrors = hero.subtitleTranslateErrors || {};
  delete hero.translateErrors;
  delete hero.subtitleTranslateErrors;

  return {
    hero,
    flashers,
    meta: {
      homepageUrl: homeUrl,
      ...baseMeta,
      translateLangs: wantsHe ? ['he'] : [],
      translateFlashers: wantsHe ? translateFlashers : null,
      translateProvider: wantsHe ? 'google_unofficial' : null,
      translateErrors,
      subtitleTranslateErrors,
      flashersTranslateErrorsSample: [],
    },
  };
}
