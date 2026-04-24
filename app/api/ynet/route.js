import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';
import { getYnetUrlConfig } from '@/lib/ynetUrlConfig';
import { parseRssItemsServer } from '@/utils/rssParseServer';
import { extractYnetHomepageHeroFromHtml } from '@/utils/ynetHomepageHeroScrape';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { buildYnetDbCsvUpdates, syncYnetRowToDbCsv } from '@/utils/ynetDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://www.ynet.co.il/';
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

/** כש־`translate` פעיל: האם לתרגם גם כותרות מבזקים (ברירת מחדל: כן). `translateFlashers=0` לביטול. */
function parseTranslateFlashers(raw) {
  if (raw === null || raw === undefined) return true;
  const v = String(raw).trim().toLowerCase();
  if (v === '' || v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

function isYnetHomeUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'ynet.co.il' || h.endsWith('.ynet.co.il');
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  return fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0; ynet-api)',
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9',
    },
    cache: 'no-store',
  });
}

async function fetchRssText(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0)',
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
 * GET /api/ynet — כותרת ראשית (מהדף הראשי: כותרת, תמונה, קישור לכתבה) + מבזקים (RSS).
 *
 * Query:
 *   `flashers`, `homeUrl`, `flashersRssUrl`
 *   `translate` — רשימת קודי שפה מופרדת בפסיקים (ברירת מחדל: en,ar).
 *     דוגמה: `translate=en,ar` או `translate=` לביטול תרגום.
 *     תרגום דרך Google (אנדפוינט לא־רשמי, ללא מפתח) → `hero.titleTranslations` + לכל מבזק `titleTranslations`.
 *   `translateFlashers` — `0` / `false` לביטול תרגום כותרות מבזקים (הכותרת הראשית עדיין מתורגמת אם `translate` פעיל).
 * בסוף הבקשה מתעדכנת שורת `source_key=ynet` ב־`data/DB.csv` (אם השורה קיימת). `meta.dbCsvSynced` / `meta.dbCsvSyncError`.
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const cfg = await getYnetUrlConfig();

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || cfg.siteUrl || DEFAULT_HOME;
    if (!isYnetHomeUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין ynet לדף הבית' }, { status: 400 });
    }

    let flashersRssUrl =
      (searchParams.get('flashersRssUrl') && searchParams.get('flashersRssUrl').trim()) ||
      (typeof cfg.flashersRssUrl === 'string' && cfg.flashersRssUrl.trim()) ||
      '';
    if (flashersRssUrl && !isAllowedRssHostUrl(flashersRssUrl)) {
      return Response.json({ error: 'כתובת flashersRssUrl לא מורשית' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));

    const [homeRes, rssXml] = await Promise.all([
      fetchHtml(homeUrl),
      flashersRssUrl ? fetchRssText(flashersRssUrl).catch((e) => ({ __err: String(e?.message || e) })) : Promise.resolve(null),
    ]);

    if (!homeRes.ok) {
      return Response.json({ error: `דף הבית HTTP ${homeRes.status}` }, { status: 502 });
    }

    const homeHtml = await homeRes.text();

    const heroResolved = extractYnetHomepageHeroFromHtml(homeHtml);

    if (!heroResolved) {
      return Response.json(
        { error: 'לא נמצאה כותרת שער בדף הבית', homeUrl },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    let flashers = [];
    let flashersMeta = { rssUrl: flashersRssUrl || null, error: null };

    if (rssXml && typeof rssXml === 'object' && rssXml.__err) {
      flashersMeta.error = rssXml.__err;
    } else if (typeof rssXml === 'string') {
      const items = parseRssItemsServer(rssXml);
      const heroLink = (heroResolved.articleUrl || '').split('#')[0];
      flashers = items
        .slice(0, flashersLimit + 5)
        .filter((it) => {
          const l = (it.link || '').split('#')[0];
          if (!heroLink || !l) return true;
          return l !== heroLink;
        })
        .slice(0, flashersLimit)
        .map((it) => ({
          title: it.title,
          articleUrl: it.link || null,
        }));
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

    const csvPatch = buildYnetDbCsvUpdates({
      hero: heroResolved,
      flashers,
      homeUrl,
      titleTranslations,
      subTitleTranslations,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncYnetRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/ynet DB.csv sync:', e);
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
        heroImageSource: heroResolved.imageSource,
        flashersRssUrl: flashersMeta.rssUrl,
        flashersReturned: flashers.length,
        flashersError: flashersMeta.error,
        translateLangs,
        translateFlashers: translateLangs.length ? translateFlashers : null,
        translateProvider: translateLangs.length ? 'google_unofficial' : null,
        translateErrors,
        flashersTranslateErrorsSample,
        dbCsvSynced,
        dbCsvSyncError,
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
    console.error('api/ynet:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }
}
