import { loadCSVData } from '@/utils/csvDatabase';
import { buildCnnDbCsvUpdates, syncCnnRowToDbCsv } from '@/utils/cnnDbCsvSync';
import { CNN_HOME_URL, CNN_RSS_URL, buildCnnNewsPayload } from '@/utils/cnnNewsPayload';

export const dynamic = 'force-dynamic';

const DEFAULT_FLASHERS = 40;
const MAX_FLASHERS = 120;
const DEFAULT_TRANSLATE_LANGS = ['he', 'ar'];
const ALLOWED_TRANSLATE_LANGS = new Set(['he', 'ar', 'en', 'fr', 'es', 'de', 'it', 'pt', 'tr', 'ru']);

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
  const v = String(raw || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isCnnFamilyUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'cnn.com' || h.endsWith('.cnn.com');
  } catch {
    return false;
  }
}

function buildFromCachedDbRow(row) {
  if (!row) return null;
  const en = row.main_headline_en || '';
  const he = row.main_headline_he || '';
  const ar = row.main_headline_ar || '';
  const hero = {
    title: en,
    fullTitle: en,
    titleTranslations: { he, ar },
    subTitle: row.image_headline_en || '',
    subTitleTranslations: { he: row.image_headline_he || '', ar: row.image_headline_ar || '' },
    imageUrl: row.image_url || '',
    articleUrl: null,
  };
  const flEn = Array.isArray(row.flashers_en) ? row.flashers_en : [];
  const flHe = Array.isArray(row.flashers_he) ? row.flashers_he : [];
  const flAr = Array.isArray(row.flashers_ar) ? row.flashers_ar : [];
  const flashers = flEn.slice(0, 60).map((t, i) => ({
    title: t,
    articleUrl: null,
    titleTranslations: { he: flHe[i] ?? '', ar: flAr[i] ?? '' },
  }));
  return { hero, flashers };
}

/**
 * GET /api/cnn — RSS edition + תרגום (ברירת מחדל translate=he,ar).
 * פרמטרים: rssUrl, homeUrl, flashers, translate, translateFlashers, useDbFallback.
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const rssUrl = (searchParams.get('rssUrl') && searchParams.get('rssUrl').trim()) || CNN_RSS_URL;
    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || CNN_HOME_URL;

    if (!isCnnFamilyUrl(rssUrl) || !isCnnFamilyUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין cnn.com ל־rssUrl ול־homeUrl' }, { status: 400 });
    }

    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));
    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const useDbFallback = parseUseDbFallback(searchParams.get('useDbFallback'));

    let hero;
    let flashers;
    let meta;

    try {
      const bundle = await buildCnnNewsPayload({
        rssUrl,
        homeUrl,
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
            error: 'לא ניתן לטעון CNN',
            fetchError,
            hint:
              'ניסינו מספר RSS של CNN ואז Google News; אם עדיין נכשל — הוסף ?useDbFallback=1 לעותק מ-DB.csv.',
          },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      const rows = await loadCSVData();
      const row = rows.find((r) => String(r.source_key || '').trim().toLowerCase() === 'cnn');
      const cached = buildFromCachedDbRow(row);
      if (!cached) {
        return Response.json(
          { error: 'אין נתונים ב-DB.csv ל־cnn', fetchError },
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
            fetchError,
            dbCsvSynced: false,
            dbCsvSyncError: null,
            dbCsvEncoding: 'utf-8-bom',
          },
        },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }

    const csvPatch = buildCnnDbCsvUpdates({
      hero,
      flashers,
      homeUrl,
      titleTranslations: hero.titleTranslations || {},
      imageHeadline: hero.subTitle || hero.title,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncCnnRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (err) {
      dbCsvSyncError = String(err?.message || err);
      console.error('api/cnn DB.csv sync:', err);
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
