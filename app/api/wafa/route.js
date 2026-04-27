import { loadCSVData } from '@/utils/csvDatabase';
import { buildWafaDbCsvUpdates, syncWafaRowToDbCsv } from '@/utils/wafaDbCsvSync';
import {
  WAFA_AR_HOME_URL,
  WAFA_EN_HOME_URL,
  WAFA_HE_HOME_URL,
  buildWafaNewsPayload,
} from '@/utils/wafaNewsPayload';

export const dynamic = 'force-dynamic';

const DEFAULT_TRANSLATE_LANGS = ['he', 'en'];
const ALLOWED_TRANSLATE_LANGS = new Set(['he', 'en', 'ar']);

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
  const DEFAULT = 40;
  const MAX = 120;
  const n = parseInt(raw || String(DEFAULT), 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT;
  return Math.min(MAX, n);
}

function isWafaHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'wafa.ps' || h.endsWith('.wafa.ps');
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
 * GET /api/wafa — ערבית מ־homeUrlAr; עברית/אנגלית מתרגום מערבית (ברירת מחדל translate=he,en).
 * פרמטרים: translate, translateFlashers, flashers, useDbFallback, homeUrlAr / homeUrlHe / homeUrlEn (למטא בלבד).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const homeUrlAr =
      (searchParams.get('homeUrlAr') && searchParams.get('homeUrlAr').trim()) || WAFA_AR_HOME_URL;
    const homeUrlHe =
      (searchParams.get('homeUrlHe') && searchParams.get('homeUrlHe').trim()) || WAFA_HE_HOME_URL;
    const homeUrlEn =
      (searchParams.get('homeUrlEn') && searchParams.get('homeUrlEn').trim()) || WAFA_EN_HOME_URL;

    if (!isWafaHostUrl(homeUrlAr) || !isWafaHostUrl(homeUrlHe) || !isWafaHostUrl(homeUrlEn)) {
      return Response.json({ error: 'מותר רק דומיין wafa.ps ל־homeUrlAr / homeUrlHe / homeUrlEn' }, { status: 400 });
    }

    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));
    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const useDbFallback = (() => {
      const v = String(searchParams.get('useDbFallback') || '').trim().toLowerCase();
      return v === '1' || v === 'true' || v === 'yes';
    })();

    let hero;
    let flashers;
    let meta;

    try {
      const bundle = await buildWafaNewsPayload({
        homeUrlAr,
        homeUrlHe,
        homeUrlEn,
        flashersLimit,
        translateLangs,
        translateFlashers,
      });
      hero = bundle.hero;
      flashers = bundle.flashers;
      meta = bundle.meta;
    } catch (e) {
      const fetchError = String(e?.message || e);
      if (!useDbFallback) {
        return Response.json(
          {
            error: 'לא ניתן לטעון WAFA',
            fetchError,
            hint: 'הוסף ?useDbFallback=1 לקבלת עותק מ-DB.csv.',
          },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      const rows = await loadCSVData();
      const row = rows.find((r) => String(r.source_key || '').trim().toLowerCase() === 'wafa');
      const cached = buildFromCachedDbRow(row);
      if (!cached) {
        return Response.json(
          { error: 'אין נתונים ב-DB.csv ל־wafa', fetchError },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      return Response.json(
        {
          fetchedAt: new Date().toISOString(),
          hero: cached.hero,
          flashers: cached.flashers,
          meta: {
            homepageUrl: homeUrlAr,
            flashersSource: 'db_csv_fallback',
            flashersReturned: cached.flashers.length,
            fetchError,
            dbCsvSynced: false,
            dbCsvSyncError: null,
            dbCsvEncoding: 'utf-8-bom',
          },
        },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }

    const csvPatch = buildWafaDbCsvUpdates({
      hero,
      flashers,
      homeUrl: homeUrlAr,
      titleTranslations: hero.titleTranslations || {},
      imageHeadline: hero.subTitle || hero.title,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncWafaRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (err) {
      dbCsvSyncError = String(err?.message || err);
      console.error('api/wafa DB.csv sync:', err);
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
