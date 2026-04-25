import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';
import { loadCSVData } from '@/utils/csvDatabase';
import { translateManyStrings, translateOneToMany } from '@/utils/googleTranslate';
import { parseRssItemsServer } from '@/utils/rssParseServer';
import { buildJordanTimesDbCsvUpdates, syncJordanTimesRowToDbCsv } from '@/utils/jordantimesDbCsvSync';

export const dynamic = 'force-dynamic';

const DEFAULT_HOME = 'https://jordantimes.com/';
const DEFAULT_RSS = 'https://jordantimes.com/rss';
/** כש־RSS הישיר חסום (Cloudflare), מנסים Google News — לא זהה לדף הבית אך עדכני יחסית. */
const GOOGLE_NEWS_JT_RSS =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent('site:jordantimes.com+when:7d') +
  '&hl=en&gl=US&ceid=US:en';
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

function isJordanTimesHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'jordantimes.com' || h.endsWith('.jordantimes.com');
  } catch {
    return false;
  }
}

async function fetchRssText(rssUrl) {
  const res = await fetch(rssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  return text;
}

function looksLikeCloudflareBlock(text) {
  const t = String(text || '').slice(0, 2500).toLowerCase();
  return t.includes('just a moment') || t.includes('cloudflare') || t.includes('cf-chl');
}

function parseUseDbFallback(raw) {
  if (raw === null || raw === undefined) return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function stripJordanTimesSeriesTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*Jordan Times\s*$/i, '')
    .trim();
}

function isJunkGoogleFeedTitle(stripped) {
  const t = String(stripped || '').trim();
  if (!t) return true;
  if (/^jordan times$/i.test(t)) return true;
  if (/^contact us\b/i.test(t)) return true;
  return false;
}

function parsePubDateMs(pubDate) {
  const ms = Date.parse(String(pubDate || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

/** מסנן פריטים ישנים/זבל ב־Google News וממיין מהחדש לישן (ה־RSS של Google לא תמיד ממוין). */
function prepareGoogleNewsItems(items, { maxAgeMs = 45 * 86400000 } = {}) {
  const now = Date.now();
  const cutoff = now - maxAgeMs;
  const cleaned = [];
  for (const it of items) {
    const stripped = stripJordanTimesSeriesTitle(it.title);
    if (isJunkGoogleFeedTitle(stripped)) continue;
    const ms = parsePubDateMs(it.pubDate);
    if (!ms || ms < cutoff) continue;
    const link = String(it.link || '').trim();
    if (!link) continue;
    cleaned.push({
      ...it,
      title: stripped,
      description: stripJordanTimesSeriesTitle(it.description),
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

function buildFromCachedDbRow(row) {
  if (!row) return null;
  const heroTitleEn = row.main_headline_en || '';
  const heroTitleHe = row.main_headline_he || '';
  const heroTitleAr = row.main_headline_ar || '';

  const hero = {
    title: heroTitleEn,
    fullTitle: heroTitleEn,
    titleTranslations: { he: heroTitleHe, ar: heroTitleAr },
    subTitle: row.image_headline_en || '',
    imageUrl: row.image_url || '',
    articleUrl: null,
  };

  const flashersEn = Array.isArray(row.flashers_en) ? row.flashers_en : [];
  const flashersHe = Array.isArray(row.flashers_he) ? row.flashers_he : [];
  const flashersAr = Array.isArray(row.flashers_ar) ? row.flashers_ar : [];

  const flashers = flashersEn.slice(0, 60).map((t, i) => ({
    title: t,
    articleUrl: null,
    titleTranslations: { he: flashersHe[i] ?? '', ar: flashersAr[i] ?? '' },
  }));

  return { hero, flashers };
}

/**
 * GET /api/jordantimes — RSS ישיר ל־Jordan Times, או Google News כ־fallback.
 *
 * האתר לעיתים חוסם שרת (Cloudflare). אז מנסים Google News (כותרות עדכניות יחסית;
 * `articleUrl` הוא לרוב קישור Google, לא ישיר ל־jordantimes.com).
 * Fallback ל־DB.csv רק עם `?useDbFallback=1` (נתונים עלולים להיות ישנים).
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;

    const homeUrl = (searchParams.get('homeUrl') && searchParams.get('homeUrl').trim()) || DEFAULT_HOME;
    const rssUrl = (searchParams.get('rssUrl') && searchParams.get('rssUrl').trim()) || DEFAULT_RSS;

    if (!isJordanTimesHostUrl(homeUrl)) {
      return Response.json({ error: 'מותר רק דומיין jordantimes.com ל־homeUrl' }, { status: 400 });
    }
    if (!isAllowedRssHostUrl(rssUrl)) {
      return Response.json({ error: 'כתובת rssUrl לא מורשית' }, { status: 400 });
    }

    const flashersLimit = normalizeFlashersLimit(searchParams.get('flashers'));
    const translateLangs = parseTranslateLangs(searchParams.get('translate'));
    const translateFlashers = parseTranslateFlashers(searchParams.get('translateFlashers'));
    const useDbFallback = parseUseDbFallback(searchParams.get('useDbFallback'));

    let items = [];
    let flashersSource = null;
    let rssError = null;
    let googleNewsError = null;

    try {
      const rssXml = await fetchRssText(rssUrl);
      if (looksLikeCloudflareBlock(rssXml)) throw new Error('Cloudflare blocked (Just a moment)');
      const parsed = parseRssItemsServer(rssXml);
      if (!parsed.length) throw new Error('RSS ריק');
      items = parsed;
      flashersSource = 'rss';
    } catch (e) {
      rssError = String(e?.message || e);
      try {
        const gXml = await fetchRssText(GOOGLE_NEWS_JT_RSS);
        if (looksLikeCloudflareBlock(gXml)) throw new Error('Google RSS blocked');
        const prepared = prepareGoogleNewsItems(parseRssItemsServer(gXml));
        if (!prepared.length) throw new Error('Google News RSS ריק אחרי סינון');
        items = prepared;
        flashersSource = 'google_news_rss';
      } catch (e2) {
        googleNewsError = String(e2?.message || e2);
        items = [];
      }
    }

    if (!items.length) {
      if (!useDbFallback) {
        return Response.json(
          {
            error: 'לא ניתן לטעון Jordan Times (RSS ישיר וגם Google News נכשלו)',
            rssUrl,
            rssError: rssError || null,
            googleNewsRssUrl: GOOGLE_NEWS_JT_RSS,
            googleNewsError: googleNewsError || null,
            hint: 'הוסף ?useDbFallback=1 לקבלת עותק שמור ב-DB.csv (עשוי להיות לא עדכני וללא קישורים).',
          },
          { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
        );
      }
      const rows = await loadCSVData();
      const row = rows.find((r) => String(r.source_key || '').trim().toLowerCase() === 'jordan_times');
      const cached = buildFromCachedDbRow(row);
      if (!cached) {
        return Response.json(
          {
            error: 'Jordan Times לא זמין ואין שורת jordan_times ב-DB.csv',
            rssUrl,
            rssError: rssError || null,
            googleNewsRssUrl: GOOGLE_NEWS_JT_RSS,
            googleNewsError: googleNewsError || null,
          },
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
            rssUrl,
            rssError: rssError || null,
            googleNewsRssUrl: GOOGLE_NEWS_JT_RSS,
            googleNewsError: googleNewsError || null,
            flashersSource: 'db_csv_fallback',
            flashersReturned: cached.flashers.length,
            translateLangs: [],
            translateFlashers: null,
            translateProvider: null,
            dbCsvSynced: false,
            dbCsvSyncError: null,
            dbCsvEncoding: 'utf-8-bom',
          },
        },
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }

    const heroItem = items[0];
    const hero = {
      title: heroItem.title || '',
      subTitle: heroItem.description || '',
      imageUrl: heroItem.imageUrl || '',
      articleUrl: heroItem.link || null,
    };

    let flashers = items
      .slice(0, flashersLimit + 5)
      .map((it) => ({
        title: it.title || '',
        articleUrl: it.link || null,
        imageUrl: it.imageUrl || null,
      }))
      .filter((it) => it.title && it.articleUrl)
      .filter((it) => it.articleUrl !== hero.articleUrl)
      .slice(0, flashersLimit);

    let titleTranslations = {};
    let translateErrors = {};
    let flashersTranslateErrorsSample = [];

    if (translateLangs.length) {
      const to = translateLangs.filter((l) => l !== 'en');
      const tr = await translateOneToMany(hero.title, { from: 'en', to });
      titleTranslations = tr.translations || {};
      translateErrors = tr.errors || {};

      if (translateFlashers && flashers.length && to.length) {
        const titles = flashers.map((f) => f.title);
        const { map: flasherMap, errors: flasherErrs } = await translateManyStrings(titles, {
          from: 'en',
          to,
          concurrency: 5,
        });
        flashers = flashers.map((f) => ({
          ...f,
          titleTranslations: flasherMap.get(String(f.title || '').trim()) || {},
        }));
        flashersTranslateErrorsSample = flasherErrs.slice(0, 12);
      }
    }

    const csvPatch = buildJordanTimesDbCsvUpdates({ hero, flashers, homeUrl, titleTranslations });
    let dbCsvSynced = false;
    let dbCsvSyncError = null;
    try {
      await syncJordanTimesRowToDbCsv(csvPatch);
      dbCsvSynced = true;
    } catch (e) {
      dbCsvSyncError = String(e?.message || e);
      console.error('api/jordantimes DB.csv sync:', e);
    }

    return Response.json(
      {
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
          rssError: flashersSource === 'rss' ? null : rssError,
          googleNewsRssUrl: GOOGLE_NEWS_JT_RSS,
          googleNewsError: flashersSource === 'google_news_rss' ? null : googleNewsError,
          flashersSource,
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
      },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('api/jordantimes:', e);
    return Response.json(
      { error: String(e?.message || e) },
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}

