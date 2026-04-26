/**
 * Gulf News (gulfnews.com) — נתוני דף הבית מ־JSON מוטמע (`#static-page`),
 * כדי שהכותרת הראשית תהיה סיפור ה־lead (למשל LIVE) ולא הפריט הראשון מרשימת "Homepage Top".
 * Fallback: Google News.
 */

import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';

export const GULF_HOME_URL = 'https://gulfnews.com/';

export const GOOGLE_NEWS_GULF_RSS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:gulfnews.com+when:7d') +
  '&hl=en&gl=AE&ceid=AE:en';

function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 2500).toLowerCase();
  return t.includes('just a moment') || t.includes('cloudflare') || t.includes('cf-chl');
}

function parseStaticPagePayload(html) {
  const m = String(html).match(/<script type="application\/json" id="static-page">([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function heroImageUrlFromStory(story, cdnHost) {
  const key = story?.['hero-image-s3-key'];
  if (!key || typeof key !== 'string') return null;
  const host = String(cdnHost || 'media.assettype.com')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return `https://${host}/${encodeURIComponent(key)}`;
}

function isPromoStory(story) {
  const h = String(story?.headline || '').toLowerCase();
  const u = String(story?.url || '').toLowerCase();
  if (/download the app|get the free app|trust gulf news/i.test(h)) return true;
  if (u.includes('trust-gulf-news') && u.includes('download')) return true;
  if (u.includes('when-it-matters-most-trust-gulf-news')) return true;
  return false;
}

function storiesFromBlock(block) {
  if (!block?.items?.length) return [];
  const out = [];
  for (const it of block.items) {
    const st = it?.story;
    if (!st?.headline || !st.url) continue;
    if (isPromoStory(st)) continue;
    out.push(st);
  }
  return out;
}

function normalizeArticleKey(u) {
  try {
    return new URL(u).pathname.replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}

function storyToCard(story, cdnHost) {
  return {
    title: String(story.headline || '').trim(),
    subTitle: String(story.subheadline || '').trim(),
    articleUrl: String(story.url || '').trim(),
    imageUrl: heroImageUrlFromStory(story, cdnHost),
  };
}

/**
 * @returns {{ hero: { title: string, subTitle: string, articleUrl: string, imageUrl: string | null }, flashersCandidates: typeof storyToCard[] } | null}
 */
function extractHomepageFromEmbeddedJson(html) {
  const payload = parseStaticPagePayload(html);
  const blocks = payload?.qt?.data?.collection?.items;
  if (!Array.isArray(blocks) || !blocks.length) return null;

  const cdnHost = payload?.qt?.config?.['cdn-image'] || 'media.assettype.com';
  const b0 = storiesFromBlock(blocks[0]);
  if (!b0.length) return null;

  const heroCard = storyToCard(b0[0], cdnHost);
  if (!heroCard.title || !heroCard.articleUrl) return null;

  const seen = new Set([normalizeArticleKey(heroCard.articleUrl)]);
  const flashersCandidates = [];

  for (const st of b0.slice(1)) {
    const k = normalizeArticleKey(st.url);
    if (seen.has(k)) continue;
    seen.add(k);
    flashersCandidates.push(storyToCard(st, cdnHost));
  }

  if (blocks[1]) {
    for (const st of storiesFromBlock(blocks[1])) {
      const k = normalizeArticleKey(st.url);
      if (seen.has(k)) continue;
      seen.add(k);
      flashersCandidates.push(storyToCard(st, cdnHost));
      if (flashersCandidates.length > 220) break;
    }
  }

  return { hero: heroCard, flashersCandidates };
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

function stripGulfGoogleTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*Gulf News\s*$/i, '')
    .trim();
}

function isJunkGulfGoogleTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^gulf news$/i.test(t)) return true;
  return false;
}

function prepareGulfGoogleItems(items, { maxAgeMs = 45 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripGulfGoogleTitle(it.title);
    if (isJunkGulfGoogleTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link) continue;
    cleaned.push({
      ...it,
      title: stripped,
      description: stripGulfGoogleTitle(it.description),
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
  const rssXml = await fetchRssText(GOOGLE_NEWS_GULF_RSS);
  if (looksLikeCloudflareBlock(rssXml)) throw new Error('Google RSS blocked');
  const raw = parseRssItemsServer(rssXml);
  const items = prepareGulfGoogleItems(raw);
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
      googleNewsRssUrl: GOOGLE_NEWS_GULF_RSS,
      flashersSource: 'google_news_rss',
      flashersReturned: flashers.length,
      note: 'נתונים מ־Google News (דף הבית לא נטען או לא נפרס).',
    },
  };
}

/** @typedef {{ homeUrl?: string, flashersLimit?: number, translateLangs?: string[], translateFlashers?: boolean }} GulfNewsPayloadOptions */

/**
 * @param {GulfNewsPayloadOptions=} opts
 */
export async function buildGulfNewsPayload(opts = {}) {
  const {
    homeUrl = GULF_HOME_URL,
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
    const parsed = extractHomepageFromEmbeddedJson(html);
    if (!parsed) throw new Error('לא נמצא JSON דף הבית (static-page)');

    hero = {
      title: parsed.hero.title,
      fullTitle: parsed.hero.title,
      titleTranslations: {},
      subTitle: parsed.hero.subTitle,
      subTitleTranslations: {},
      imageUrl: parsed.hero.imageUrl,
      articleUrl: parsed.hero.articleUrl,
    };

    const heroKey = normalizeArticleKey(hero.articleUrl);
    flashers = parsed.flashersCandidates
      .filter((c) => normalizeArticleKey(c.articleUrl) !== heroKey)
      .slice(0, limit)
      .map((c) => ({
        title: c.title,
        articleUrl: c.articleUrl,
        imageUrl: c.imageUrl,
      }));

    baseMeta = {
      flashersSource: 'homepage_embedded_json',
      flashersReturned: flashers.length,
      googleNewsRssUrl: GOOGLE_NEWS_GULF_RSS,
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
