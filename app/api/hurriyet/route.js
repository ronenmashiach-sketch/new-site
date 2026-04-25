import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';
import { parseRssItemsServer } from '@/utils/rssParseServer';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { buildHurriyetDbCsvUpdates, syncHurriyetRowToDbCsv } from '@/utils/hurriyetDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://www.hurriyetdailynews.com/';
const DEFAULT_RSS = 'https://www.hurriyetdailynews.com/rss/news';
const DEFAULT_FLASHERS = 40;
const MAX_FLASHERS = 120;
const DEFAULT_TRANSLATE_LANGS = ['he', 'ar'];
const ALLOWED_TRANSLATE_LANGS = new Set([
  'he',
  'ar',
  'en',
  'ru',
  'fr',
  'es',
  'de',
  'it',
  'pt',
  'tr',
  'zh-Hans',
]);

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

function normalizeFlashersLimit(raw) {
  const n = parseInt(raw || String(DEFAULT_FLASHERS), 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_FLASHERS;
  return Math.min(MAX_FLASHERS, n);
}

function isHurriyetHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'hurriyetdailynews.com' || h.endsWith('.hurriyetdailynews.com');
  } catch {
    return false;
  }
}

function normalizeHurriyetImageUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('file://')) return `https://${s.slice('file://'.length)}`;
  if (s.startsWith('//')) return `https:${s}`;
  return s;
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
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return res.text();
}

/**
 * GET /api/hurriyet — כותרת ראשית + מבזקים מתוך RSS של Hürriyet Daily News.
 *
 * Query: `homeUrl`, `rssUrl`, `flashers`, `translate`, `translateFlashers`
 * בסוף: עדכון שורת `source_key=hurriyet` ב־`data/DB.csv` (אם קיימת).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || DEFAULT_HOME;
    const rssUrl = (searchParams.get('rssUrl') && searchParams.get('rssUrl').trim()) || DEFAULT_RSS;

    if (!isHurriyetHostUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין hurriyetdailynews.com ל־homeUrl' }, { status: 400 });
    }
    if (!isAllowedRssHostUrl(rssUrl)) {
      return Response.json({ error: 'כתובת rssUrl לא מורשית' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));

    const rssXml = await fetchRssText(rssUrl);
    const items = parseRssItemsServer(rssXml);
    if (!items.length) {
      return Response.json(
        { error: 'RSS חזר ללא פריטים', rssUrl },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      );
    }

    const heroItem = items[0];
    const hero = {
      title: heroItem.title || '',
      subTitle: heroItem.description || '',
      imageUrl: normalizeHurriyetImageUrl(heroItem.imageUrl),
      articleUrl: heroItem.link || null,
    };

    let flashers = items
      .slice(0, flashersLimit + 5)
      .map((it) => ({
        title: it.title || '',
        articleUrl: it.link || null,
        imageUrl: normalizeHurriyetImageUrl(it.imageUrl),
      }))
      .filter((it) => it.title && it.articleUrl)
      .filter((it) => it.articleUrl !== hero.articleUrl)
      .slice(0, flashersLimit);

    let titleTranslations = {};
    let translateErrors = {};
    let flashersTranslateErrorsSample = [];

    if (translateLangs.length) {
      const tr = await translateOneToMany(hero.title, { from: 'en', to: translateLangs.filter((l) => l !== 'en') });
      titleTranslations = tr.translations || {};
      translateErrors = tr.errors || {};

      if (translateFlashers && flashers.length) {
        const titles = flashers.map((f) => f.title);
        const { map: flasherMap, errors: flasherErrs } = await translateManyStrings(titles, {
          from: 'en',
          to: translateLangs.filter((l) => l !== 'en'),
          concurrency: 5,
        });
        flashers = flashers.map((f) => ({
          ...f,
          titleTranslations: flasherMap.get(String(f.title || '').trim()) || {},
        }));
        flashersTranslateErrorsSample = flasherErrs.slice(0, 12);
      }
    }

    const csvPatch = buildHurriyetDbCsvUpdates({
      hero,
      flashers,
      homeUrl,
      titleTranslations,
      imageHeadline: hero.subTitle || hero.title,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncHurriyetRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/hurriyet DB.csv sync:', e);
    }

    const payload = {
      fetchedAt: new Date().toISOString(),
      hero: {
        title: hero.title,
        fullTitle: hero.title,
        titleTranslations,
        subTitle: hero.subTitle,
        imageUrl: hero.imageUrl,
        articleUrl: hero.articleUrl,
      },
      flashers,
      meta: {
        homepageUrl: homeUrl,
        rssUrl,
        flashersSource: 'rss',
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
    console.error('api/hurriyet:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}

