import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';
import { parseRssItemsServer } from '@/utils/rssParseServer';
import {
  extractIsraelHayomHomeHeroFromHtml,
} from '@/utils/israelhayomScrape';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import {
  buildIsraelHayomDbCsvUpdates,
  syncIsraelHayomRowToDbCsv,
} from '@/utils/israelhayomDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://www.israelhayom.co.il/';
const DEFAULT_ISRAELNOW = 'https://www.israelhayom.co.il/israelnow';
const DEFAULT_FLASHERS_RSS = 'https://www.israelhayom.co.il/rss.xml';
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

function isIsraelHayomHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'israelhayom.co.il' || h.endsWith('.israelhayom.co.il');
  } catch {
    return false;
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
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
 * GET /api/israelhayom — כותרת ראשית מדף הבית (Elementor ב־__NEXT_DATA__); מבזקים מ־RSS כללי
 * (`rss.xml`) כי רשימת המבזקים ב־`/israelnow` נטענת בדפדפן (GraphQL/Firebase) ולא ב־SSR.
 *
 * Query: `homeUrl`, `israelnowUrl`, `flashersRssUrl`, `flashers`, `translate`, `translateFlashers`
 * עדכון שורת `source_key=israelhayom` ב־`data/DB.csv` (אם קיימת).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || DEFAULT_HOME;
    const israelnowUrl =
      (searchParams.get('israelnowUrl') && searchParams.get('israelnowUrl').trim()) || DEFAULT_ISRAELNOW;

    if (!isIsraelHayomHostUrl(homeUrl) || !isIsraelHayomHostUrl(israelnowUrl)) {
      return Response.json(
        { error: 'מותר רק דומיין israelhayom.co.il ל־homeUrl ו־israelnowUrl' },
        { status: 400 },
      );
    }

    let flashersRssUrl =
      (searchParams.get('flashersRssUrl') && searchParams.get('flashersRssUrl').trim()) || DEFAULT_FLASHERS_RSS;
    if (flashersRssUrl && !isAllowedRssHostUrl(flashersRssUrl)) {
      return Response.json({ error: 'כתובת flashersRssUrl לא מורשית' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));

    const homeOrigin = new URL(homeUrl).origin;

    const [homeRes, rssXml] = await Promise.all([
      fetchHtml(homeUrl),
      flashersRssUrl
        ? fetchRssText(flashersRssUrl).catch((e) => ({ __err: String(e?.message || e) }))
        : Promise.resolve(null),
    ]);

    if (!homeRes.ok) {
      return Response.json({ error: `דף הבית HTTP ${homeRes.status}` }, { status: 502 });
    }

    const homeHtml = await homeRes.text();

    let heroResolved = extractIsraelHayomHomeHeroFromHtml(homeHtml, homeOrigin);
    if (!heroResolved) {
      return Response.json(
        { error: 'לא נמצאה כותרת שער בדף הבית (elementor / item_number 0)', homeUrl },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      );
    }

    let rawFlashers = [];
    let flashersSource = 'none';
    let rssMeta = { rssUrl: flashersRssUrl || null, error: null };

    if (rssXml && typeof rssXml === 'object' && rssXml.__err) {
      rssMeta.error = rssXml.__err;
      flashersSource = `rss_error:${rssXml.__err}`;
    } else if (typeof rssXml === 'string') {
      const items = parseRssItemsServer(rssXml);
      rawFlashers = items
        .slice(0, flashersLimit + 5)
        .map((it) => ({ title: it.title, articleUrl: it.link || null }))
        .filter((it) => it.title && it.articleUrl);
      flashersSource = 'rss';
    }

    const heroLink = (heroResolved.articleUrl || '').split('#')[0];
    let flashers = rawFlashers
      .filter((it) => {
        const l = (it.articleUrl || '').split('#')[0];
        if (!heroLink || !l) return true;
        return l !== heroLink;
      })
      .slice(0, flashersLimit);

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

    const csvPatch = buildIsraelHayomDbCsvUpdates({
      hero: heroResolved,
      flashers,
      homeUrl,
      titleTranslations,
      subTitleTranslations,
    });

    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncIsraelHayomRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/israelhayom DB.csv sync:', e);
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
        articleId: heroResolved.articleId,
      },
      flashers,
      meta: {
        homepageUrl: homeUrl,
        israelnowUrl,
        flashersRssUrl: rssMeta.rssUrl,
        flashersRssError: rssMeta.error,
        flashersSource,
        flashersNote:
          'רשימת מבזקי /israelnow נטענת בצד לקוח (לא ב־SSR); המבזקים כאן הם מפיד RSS כללי (סדר שונה מדף המבזקים).',
        heroImageSource: 'elementor_wp_uploads',
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
    console.error('api/israelhayom:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
