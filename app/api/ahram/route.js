import { buildAhramDbCsvUpdates, syncAhramRowToDbCsv } from '@/utils/ahramDbCsvSync';
import { AHRAM_HOME_URL, buildAhramNewsPayload } from '@/utils/ahramNewsPayload';

export const dynamic = 'force-dynamic';

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

function isAhramEnglishHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'english.ahram.org.eg' || h.endsWith('.english.ahram.org.eg');
  } catch {
    return false;
  }
}

/**
 * GET /api/ahram — דף הבית + תרגום + עדכון `source_key=ahram` ב־DB.csv.
 *
 * Query: `homeUrl`, `flashers`, `translate`, `translateFlashers`
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || AHRAM_HOME_URL;

    if (!isAhramEnglishHostUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין english.ahram.org.eg ל־homeUrl' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));

    const { hero, flashers, meta } = await buildAhramNewsPayload(
      /** @type {import('@/utils/ahramNewsPayload.js').AhramNewsPayloadOptions} */ ({
        homeUrl,
        flashersLimit,
        translateLangs,
        translateFlashers,
      }),
    );

    const csvPatch = buildAhramDbCsvUpdates({
      hero,
      flashers,
      homeUrl,
      titleTranslations: hero.titleTranslations || {},
      imageHeadline: hero.subTitle || hero.title,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncAhramRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/ahram DB.csv sync:', e);
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
