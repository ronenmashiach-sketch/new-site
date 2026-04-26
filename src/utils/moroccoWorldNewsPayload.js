/**
 * Morocco World News — כותרת ראשית מעמודת התוכן הראשית (vc_col-sm-8 + jeg_main_content),
 * לא מסריקה כלל־דף שעלולה לפספס את הסדר הנכון. גיבוי: RSS וורדפרס.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const MOROCCO_WORLD_HOME_URL = 'https://www.moroccoworldnews.com/';

export const MOROCCO_WORLD_FEED_URL = 'https://www.moroccoworldnews.com/feed/';

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

function isArticlePath(url) {
  try {
    const u = new URL(url);
    if (!/moroccoworldnews\.com$/i.test(u.hostname) && !/\.moroccoworldnews\.com$/i.test(u.hostname)) {
      return false;
    }
    return /\/\d{4}\/\d{2}\/\d+\/[^/]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** עמודת הero הרחבה לפני הסיידבר — שם הכתבה הראשונה היא המובילה האמיתית. */
function extractPrimaryMainColumnHtml(html) {
  const marker = 'vc_col-sm-8';
  const need = 'jeg_main_content';
  let idx = 0;
  while (idx < html.length) {
    const i = html.indexOf(marker, idx);
    if (i < 0) return null;
    const head = html.slice(i, i + 500);
    if (head.includes(need) && head.includes('vc_column_container')) {
      const from = i;
      const after = html.slice(from);
      const endRel = after.search(
        /<div class="wpb_column jeg_column vc_column_container vc_col-sm-4[^"]*jeg_sidebar/i
      );
      if (endRel < 0) return after.slice(0, Math.min(after.length, 900000));
      return after.slice(0, endRel);
    }
    idx = i + marker.length;
  }
  return null;
}

function extractImageFromArticleBlock(block) {
  const ds = block.match(/\bdata-src="(https:\/\/[^"]+)"/i);
  if (ds && !ds[1].toLowerCase().startsWith('data:')) return decodeHtmlEntities(ds[1].trim());
  const du = block.match(/\bdata-lazy-src="(https:\/\/[^"]+)"/i);
  if (du && !du[1].toLowerCase().startsWith('data:')) return decodeHtmlEntities(du[1].trim());
  const src = block.match(/<img[^>]+src="(https:\/\/www\.moroccoworldnews\.com\/[^"]+)"/i);
  if (src && !src[1].toLowerCase().startsWith('data:')) return decodeHtmlEntities(src[1].trim());
  return null;
}

function parseArticleBlocks(columnHtml) {
  const re = /<article class="jeg_post[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  const cards = [];
  let m;
  while ((m = re.exec(columnHtml)) !== null) {
    const block = m[1];
    const tm = block.match(
      /<h3 class="jeg_post_title"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!tm) continue;
    const articleUrl = decodeHtmlEntities(tm[1].trim());
    if (!isArticlePath(articleUrl)) continue;
    const title = decodeHtmlEntities(stripTags(tm[2]));
    if (!title) continue;

    const ex = block.match(/<div class="jeg_post_excerpt"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    const subTitle = ex ? decodeHtmlEntities(stripTags(ex[1])) : '';

    const imageUrl = extractImageFromArticleBlock(block);

    cards.push({ title, subTitle, articleUrl, imageUrl });
  }
  return cards;
}

function normalizeArticleKey(u) {
  try {
    return new URL(u).pathname.replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}

function extractHomepageFromMainColumn(html) {
  const col = extractPrimaryMainColumnHtml(html);
  if (!col) return null;
  const cards = parseArticleBlocks(col);
  if (!cards.length) return null;
  return cards;
}

async function fetchHomepageHtml(url) {
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
    .replace(/\s*[-|]\s*Morocco World News\s*$/i, '')
    .trim();
}

function isJunkFeedTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^morocco world news$/i.test(t)) return true;
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
    if (!link || !isArticlePath(link)) continue;
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
    const k = normalizeArticleKey(it.link);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(it);
  }
  return deduped;
}

async function loadFromWordPressFeed(flashersLimit) {
  const rssXml = await fetchRssText(MOROCCO_WORLD_FEED_URL);
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
      wordpressFeedUrl: MOROCCO_WORLD_FEED_URL,
      flashersSource: 'wordpress_feed',
      flashersReturned: flashers.length,
      note: 'נתונים מ־RSS (דף הבית לא נטען או לא נפרס).',
    },
  };
}

/** @typedef {{ homeUrl?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} MoroccoWorldNewsPayloadOptions */

/**
 * @param {MoroccoWorldNewsPayloadOptions=} opts
 */
export async function buildMoroccoWorldNewsPayload(opts = {}) {
  const {
    homeUrl = MOROCCO_WORLD_HOME_URL,
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
    const cards = extractHomepageFromMainColumn(html);
    if (!cards?.length) throw new Error('לא נמצאו כתבות בעמודה הראשית');

    const [first, ...rest] = cards;
    hero = {
      title: first.title,
      fullTitle: first.title,
      titleTranslations: {},
      subTitle: first.subTitle,
      subTitleTranslations: {},
      imageUrl: first.imageUrl,
      articleUrl: first.articleUrl,
    };

    const heroKey = normalizeArticleKey(hero.articleUrl);
    flashers = rest
      .filter((c) => normalizeArticleKey(c.articleUrl) !== heroKey)
      .slice(0, limit)
      .map((c) => ({
        title: c.title,
        articleUrl: c.articleUrl,
        imageUrl: c.imageUrl,
      }));

    baseMeta = {
      wordpressFeedUrl: MOROCCO_WORLD_FEED_URL,
      flashersSource: 'homepage_main_column',
      flashersReturned: flashers.length,
    };
  } catch {
    const g = await loadFromWordPressFeed(limit);
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
