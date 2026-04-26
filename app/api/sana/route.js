import { loadCSVData } from '@/utils/csvDatabase';
import { buildSanaDbCsvUpdates, syncSanaRowToDbCsv } from '@/utils/sanaDbCsvSync';
import { SANA_EN_HOME_URL, SANA_FEED_URL, SANA_HOME_URL, buildSanaNewsPayload } from '@/utils/sanaNewsPayload';

export const dynamic = 'force-dynamic';

const DEFAULT_FLASHERS = 40;
const MAX_FLASHERS = 120;
const DEFAULT_TRANSLATE_LANGS = ['he'];
const ALLOWED_TRANSLATE_LANGS = new Set([
  'he',
  'en',
  'ar',
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

function parseUseDbFallback(raw) {
  if (raw === null || raw === undefined) return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isSanaHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'sana.sy' || h.endsWith('.sana.sy');
  } catch {
    return false;
  }
}

function buildFromCachedDbRow(row) {
  if (!row) return null;
  const ar = row.main_headline_ar || '';
  const he = row.main_headline_he || '';
  const en = row.main_headline_en || '';
  const hero = {
    title: ar,
    fullTitle: ar,
    titleTranslations: { he, en },
    subTitle: row.image_headline_ar || '',
    subTitleTranslations: { he: row.image_headline_he || '', en: row.image_headline_en || '' },
    imageUrl: row.image_url || '',
    articleUrl: null,
  };
  const flAr = Array.isArray(row.flashers_ar) ? row.flashers_ar : [];
  const flHe = Array.isArray(row.flashers_he) ? row.flashers_he : [];
  const flEn = Array.isArray(row.flashers_en) ? row.flashers_en : [];
  const flashers = flAr.slice(0, 60).map((t, i) => ({
    title: t,
    articleUrl: null,
    titleTranslations: { he: flHe[i] ?? '', en: flEn[i] ?? '' },
  }));
  return { hero, flashers };
}

/**
 * GET /api/sana — ערבית מ־homeUrl (ברירת מחדל sana.sy), אנגלית מ־homeUrlEn (ברירת מחדל sana.sy/en), תרגום אוטומטי רק ל־he.
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || SANA_HOME_URL;
    const homeUrlEn =
      (searchParams.get('homeUrlEn') && searchParams.get('homeUrlEn').trim()) || SANA_EN_HOME_URL;

    if (!isSanaHostUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין sana.sy ל־homeUrl' }, { status: 400 });
    }
    if (!isSanaHostUrl(homeUrlEn)) {
      return Response.json({ error: 'מותר רק דומיין sana.sy ל־homeUrlEn' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));
    const useDbFallback = parseUseDbFallback(searchParams.get('useDbFallback'));

    let hero;
    let flashers;
    let meta;

    try {
      const bundle = await buildSanaNewsPayload(
        /** @type {import('@/utils/sanaNewsPayload.js').SanaNewsPayloadOptions} */ ({
          homeUrl,
          homeUrlEn,
          flashersLimit,
          translateLangs,
          translateFlashers,
        }),
      );
      hero = bundle.hero;
      flashers = bundle.flashers;
      meta = bundle.meta;
    } catch (e) {
      const fetchError = String(e?.message || e);
      if (!useDbFallback) {
        return Response.json(
          {
            error: 'לא ניתן לטעון SANA (דף הבית וגם RSS נכשלו)',
            wordpressFeedUrl: SANA_FEED_URL,
            fetchError,
            hint: 'הוסף ?useDbFallback=1 לקבלת עותק מ-DB.csv.',
          },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      const rows = await loadCSVData();
      const row = rows.find((r) => String(r.source_key || '').trim().toLowerCase() === 'sana');
      const cached = buildFromCachedDbRow(row);
      if (!cached) {
        return Response.json(
          { error: 'אין נתונים ב-DB.csv ל־sana', fetchError },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      return Response.json(
        {
          fetchedAt: new Date().toISOString(),
          hero: cached.hero,
          flashers: cached.flashers,
          meta: {
            homepageUrl: homeUrl,
            flashersSource: 'db_csv_fallback',
            flashersReturned: cached.flashers.length,
            wordpressFeedUrl: SANA_FEED_URL,
            fetchError,
            dbCsvSynced: false,
            dbCsvSyncError: null,
            dbCsvEncoding: 'utf-8-bom',
          },
        },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }

    const csvPatch = buildSanaDbCsvUpdates({
      hero,
      flashers,
      homeUrl,
      titleTranslations: hero.titleTranslations || {},
      imageHeadline: hero.subTitle || hero.title,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncSanaRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (err) {
      dbCsvSyncError = String(err?.message || err);
      console.error('api/sana DB.csv sync:', err);
    }

    return Response.json(
      {
        fetchedAt: new Date().toISOString(),
        hero,
        flashers,
        meta: {
          ...meta,
          dbCsvSynced,
          dbCsvSyncError,
          dbCsvEncoding: 'utf-8-bom',
        },
      },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
