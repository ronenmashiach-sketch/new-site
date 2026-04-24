import { extractMaarivBreakingItemsFromHtml, extractMaarivHomepageHeroFromHtml } from '@/utils/maarivScrape';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { buildMaarivDbCsvUpdates, syncMaarivRowToDbCsv } from '@/utils/maarivDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://www.maariv.co.il/';
const DEFAULT_BREAKING = 'https://www.maariv.co.il/breaking-news';
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

function isMaarivHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'maariv.co.il' || h.endsWith('.maariv.co.il');
  } catch {
    return false;
  }
}

function originFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://www.maariv.co.il';
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

function normalizeFlashersLimit(raw) {
  const n = parseInt(raw || String(DEFAULT_FLASHERS), 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_FLASHERS;
  return Math.min(MAX_FLASHERS, n);
}

/**
 * GET /api/maariv — כותרת ראשית מדף הבית + מבזקים מ־/breaking-news (HTML).
 *
 * Query: `homeUrl`, `breakingUrl`, `flashers`, `translate`, `translateFlashers`
 * בסוף: עדכון שורת `source_key=maariv` ב־`data/DB.csv` (אם קיימת).
 * שמירת CSV: UTF-8 עם BOM (`csvDatabaseWrite.server.js`).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || DEFAULT_HOME;
    const breakingUrl = (searchParams.get('breakingUrl') && searchParams.get('breakingUrl').trim()) || DEFAULT_BREAKING;

    if (!isMaarivHostUrl(homeUrl) || !isMaarivHostUrl(breakingUrl)) {
      return Response.json({ error: 'מותר רק דומיין maariv ל־homeUrl ו־breakingUrl' }, { status: 400 });
    }

    const baseOrigin = originFromUrl(homeUrl);
    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));

    const [homeRes, breakingRes] = await Promise.all([fetchHtml(homeUrl), fetchHtml(breakingUrl)]);

    if (!homeRes.ok) {
      return Response.json({ error: `דף הבית HTTP ${homeRes.status}` }, { status: 502 });
    }
    if (!breakingRes.ok) {
      return Response.json({ error: `דף מבזקים HTTP ${breakingRes.status}` }, { status: 502 });
    }

    const homeHtml = await homeRes.text();
    const breakingHtml = await breakingRes.text();

    const heroResolved = extractMaarivHomepageHeroFromHtml(homeHtml, baseOrigin);
    if (!heroResolved) {
      return Response.json(
        { error: 'לא נמצאה כותרת שער (top-maariv) בדף הבית', homeUrl },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    let rawFlashers = extractMaarivBreakingItemsFromHtml(breakingHtml, flashersLimit + 8, baseOrigin);
    const heroLink = (heroResolved.articleUrl || '').split('#')[0];
    let flashers = rawFlashers
      .filter((it) => {
        const l = (it.articleUrl || '').split('#')[0];
        if (!heroLink || !l) return true;
        return l !== heroLink;
      })
      .slice(0, flashersLimit);

    let flashersMeta = { breakingUrl, error: null };

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

    const csvPatch = buildMaarivDbCsvUpdates({
      hero: heroResolved,
      flashers,
      homeUrl,
      titleTranslations,
      subTitleTranslations,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncMaarivRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/maariv DB.csv sync:', e);
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
        breakingUrl: flashersMeta.breakingUrl,
        heroImageSource: heroResolved.imageSource,
        flashersReturned: flashers.length,
        flashersError: flashersMeta.error,
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
    console.error('api/maariv:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}
