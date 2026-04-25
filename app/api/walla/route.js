import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';
import { parseRssItemsServer } from '@/utils/rssParseServer';
import {
  extractWallaBreakingPageItemsFromHtml,
  extractWallaHomepageHeroFromHtml,
  extractWallaHomepageNewsflashFromHtml,
  fillWallaHeroImageFromArticlePage,
} from '@/utils/wallaScrape';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { buildWallaDbCsvUpdates, syncWallaRowToDbCsv } from '@/utils/wallaDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://www.walla.co.il/';
const DEFAULT_BREAKING = 'https://news.walla.co.il/breaking';
const DEFAULT_FLASHERS_RSS = 'https://rss.walla.co.il/feed/1';
const DEFAULT_FLASHERS = 40;
const MAX_FLASHERS = 120;
const DEFAULT_TRANSLATE_LANGS = ['en', 'ar'];
const ALLOWED_TRANSLATE_LANGS = new Set(['en', 'ar', 'ru', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'zh-Hans']);

function parseTranslateLangs(raw) {
  if (raw === null || raw === undefined) return DEFAULT_TRANSLATE_LANGS;
  const trimmed = String(raw).trim();
  if (!trimmed) return [];
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => ALLOWED_TRANSLATE_LANGS.has(s));
}

function parseTranslateFlashers(raw) {
  if (raw === null || raw === undefined) return true;
  const v = String(raw).trim().toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

function isWallaHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'walla.co.il' || h.endsWith('.walla.co.il');
  } catch {
    return false;
  }
}

function breakingOriginFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.hostname.toLowerCase().startsWith('news.')) return `${u.protocol}//${u.host}`;
    return 'https://news.walla.co.il';
  } catch {
    return 'https://news.walla.co.il';
  }
}

async function fetchHtml(url) {
  return fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9',
    },
    cache: 'no-store',
  });
}

async function fetchRssText(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0; walla-api)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return res.text();
}

function normalizeFlashersLimit(raw) {
  const n = parseInt(raw || String(DEFAULT_FLASHERS), 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_FLASHERS;
  return Math.min(MAX_FLASHERS, n);
}

/**
 * GET /api/walla — כותרת ראשית מדף הבית + מבזקים מעמוד המבזקים (HTML).
 * גיבוי מבזקים: RSS חדשות באארץ (`rss.walla.co.il/feed/1`) ואז שורת המבזקים בדף הבית.
 *
 * Query: `homeUrl`, `breakingUrl`, `flashersRssUrl`, `flashers`, `translate`, `translateFlashers`
 * בסוף: עדכון שורת `source_key=walla` ב־`data/DB.csv` (אם קיימת).
 * שמירת CSV: UTF-8 עם BOM (`csvDatabaseWrite.server.js`).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || DEFAULT_HOME;
    const breakingUrl = (searchParams.get('breakingUrl') && searchParams.get('breakingUrl').trim()) || DEFAULT_BREAKING;

    if (!isWallaHostUrl(homeUrl) || !isWallaHostUrl(breakingUrl)) {
      return Response.json({ error: 'מותר רק דומיין walla ל־homeUrl ו־breakingUrl' }, { status: 400 });
    }

    let flashersRssUrl =
      (searchParams.get('flashersRssUrl') && searchParams.get('flashersRssUrl').trim()) || DEFAULT_FLASHERS_RSS;
    if (flashersRssUrl && !isAllowedRssHostUrl(flashersRssUrl)) {
      return Response.json({ error: 'כתובת flashersRssUrl לא מורשית' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));
    const breakingOrigin = breakingOriginFromUrl(breakingUrl);

    const [homeRes, breakingRes, rssXml] = await Promise.all([
      fetchHtml(homeUrl),
      fetchHtml(breakingUrl),
      flashersRssUrl
        ? fetchRssText(flashersRssUrl).catch((e) => ({ __err: String(e?.message || e) }))
        : Promise.resolve(null),
    ]);

    if (!homeRes.ok) {
      return Response.json({ error: `דף הבית HTTP ${homeRes.status}` }, { status: 502 });
    }
    if (!breakingRes.ok) {
      return Response.json({ error: `דף מבזקים HTTP ${breakingRes.status}` }, { status: 502 });
    }

    const homeHtml = await homeRes.text();
    const breakingHtml = await breakingRes.text();

    let heroResolved = extractWallaHomepageHeroFromHtml(homeHtml);
    if (!heroResolved) {
      return Response.json(
        { error: 'לא נמצאה כותרת שער (drama-wide) בדף הבית', homeUrl },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    heroResolved = await fillWallaHeroImageFromArticlePage(heroResolved);

    let rawFlashers = extractWallaBreakingPageItemsFromHtml(
      breakingHtml,
      flashersLimit + 8,
      breakingOrigin
    );
    let flashersSource = 'breaking_html';

    if (rawFlashers.length === 0) {
      if (rssXml && typeof rssXml === 'object' && rssXml.__err) {
        flashersSource = `breaking_empty_rss_error:${rssXml.__err}`;
      } else if (typeof rssXml === 'string') {
        const items = parseRssItemsServer(rssXml);
        rawFlashers = items
          .slice(0, flashersLimit + 5)
          .map((it) => ({ title: it.title, articleUrl: it.link || null }))
          .filter((it) => it.title && it.articleUrl);
        flashersSource = 'rss';
      }
    }

    if (rawFlashers.length === 0) {
      rawFlashers = extractWallaHomepageNewsflashFromHtml(homeHtml, flashersLimit + 8);
      flashersSource = 'homepage_newsflash';
    }

    const heroLink = (heroResolved.articleUrl || '').split('#')[0];
    let flashers = rawFlashers
      .filter((it) => {
        const l = (it.articleUrl || '').split('#')[0];
        if (!heroLink || !l) return true;
        return l !== heroLink;
      })
      .slice(0, flashersLimit);

    let rssMeta = { rssUrl: flashersRssUrl || null, error: null };
    if (rssXml && typeof rssXml === 'object' && rssXml.__err) {
      rssMeta.error = rssXml.__err;
    }

    let titleTranslations = {};
    let translateErrors = {};
    let flashersTranslateErrorsSample = [];
    let subTitleTranslations = {};

    if (translateLangs.length) {
      const tr = await translateOneToMany(heroResolved.title, { from: 'he', to: translateLangs });
      titleTranslations = tr.translations || {};
      translateErrors = tr.errors || {};

      const subHe = (heroResolved.subTitle || '').trim();
      if (subHe) {
        const subForTranslate = subHe.length > 2500 ? `${subHe.slice(0, 2500)}…` : subHe;
        const subTr = await translateOneToMany(subForTranslate, { from: 'he', to: translateLangs });
        subTitleTranslations = subTr.translations || {};
        for (const [lang, err] of Object.entries(subTr.errors || {})) {
          if (err) translateErrors[`subTitle_${lang}`] = err;
        }
      }

      if (translateFlashers && flashers.length) {
        const titles = flashers.map((f) => f.title);
        const { map: flasherMap, errors: flasherErrs } = await translateManyStrings(titles, {
          from: 'he',
          to: translateLangs,
          concurrency: 5,
        });
        flashers = flashers.map((f) => ({
          ...f,
          titleTranslations: flasherMap.get(String(f.title || '').trim()) || {},
        }));
        flashersTranslateErrorsSample = flasherErrs.slice(0, 12);
      }
    }

    const csvPatch = buildWallaDbCsvUpdates({
      hero: heroResolved,
      flashers,
      homeUrl,
      titleTranslations,
      subTitleTranslations,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncWallaRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/walla DB.csv sync:', e);
    }

    const payload = {
      fetchedAt: new Date().toISOString(),
      hero: {
        title: heroResolved.title,
        fullTitle: heroResolved.title,
        titleTranslations,
        subTitle: heroResolved.subTitle,
        imageUrl: heroResolved.imageUrl,
        articleUrl: heroResolved.articleUrl,
      },
      flashers,
      meta: {
        homepageUrl: homeUrl,
        breakingUrl,
        flashersRssUrl: rssMeta.rssUrl,
        flashersRssError: rssMeta.error,
        flashersSource,
        heroImageSource: heroResolved.imageSource,
        flashersReturned: flashers.length,
        translateLangs,
        translateFlashers: translateLangs.length ? translateFlashers : null,
        translateProvider: translateLangs.length ? 'google_unofficial' : null,
        translateErrors,
        flashersTranslateErrorsSample,
        dbCsvSynced,
        dbCsvSyncError,
        dbCsvEncoding: 'utf-8-bom',
      },
    };

    return Response.json(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('api/walla:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}
