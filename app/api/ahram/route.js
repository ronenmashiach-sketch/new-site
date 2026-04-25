export const dynamic = 'force-dynamic';

const HOME_URL = 'https://english.ahram.org.eg/';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

function decodeHtmlEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name.toLowerCase()] || m);
}

function stripTags(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAbsUrl(baseUrl, maybeRelative) {
  const s = String(maybeRelative || '').trim();
  if (!s) return null;
  try {
    return new URL(s, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractHeroBlock(html) {
  // Hero starts at first <h1 class='title'> on the page.
  const start = html.toLowerCase().indexOf("<h1 class='title'");
  if (start < 0) return null;
  const chunk = html.slice(start, start + 25000);

  const a = chunk.match(/<h1[^>]*class='title'[^>]*>[\s\S]*?<a[^>]+href='([^']+)'[^>]*>([\s\S]*?)<\/a>/i);
  if (!a) return null;

  const href = a[1];
  const title = decodeHtmlEntities(stripTags(a[2]));

  const p = chunk.match(/<\/h1>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  const subTitle = p ? decodeHtmlEntities(stripTags(p[1])) : '';

  // Find first real news image after the hero title (skip the small weekly icon).
  const imgs = [...chunk.matchAll(/<img[^>]+src='([^']+)'/gi)].map((m) => m[1]);
  const heroImg = imgs.find((src) => src && !src.includes('icon-weekly') && /\/?Media\/News\//i.test(src)) || null;

  return { title, subTitle, href, heroImg };
}

function extractFlashers(html, baseUrl, heroAbsUrl, limit) {
  // Prefer NewsContent links; keep unique by URL.
  const links = [...html.matchAll(/<a[^>]+href='(NewsContent\/[^']+)'[^>]*>([\s\S]*?)<\/a>/gi)];
  const out = [];
  const seen = new Set();

  for (const m of links) {
    const abs = toAbsUrl(baseUrl, m[1]);
    if (!abs) continue;
    if (abs === heroAbsUrl) continue;
    if (seen.has(abs)) continue;
    const title = decodeHtmlEntities(stripTags(m[2]));
    if (!title) continue;
    seen.add(abs);
    out.push({ title, articleUrl: abs });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Homepage HTTP ${res.status}`);
  return res.text();
}

/**
 * GET /api/ahram — סקרייפ קל של דף הבית (english.ahram.org.eg) כדי להתאים למה שרואים באתר.
 * Query: `flashers` (default 40, max 120)
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const raw = searchParams.get('flashers');
    const n = Math.min(120, Math.max(0, parseInt(raw || '40', 10) || 40));

    const html = await fetchHtml(HOME_URL);
    const heroBlock = extractHeroBlock(html);
    if (!heroBlock) {
      return Response.json(
        { error: 'לא הצלחתי לזהות כותרת ראשית בדף הבית', homepageUrl: HOME_URL },
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      );
    }

    const articleUrl = toAbsUrl(HOME_URL, heroBlock.href);
    const imageUrl = toAbsUrl(HOME_URL, heroBlock.heroImg);

    const flashers = extractFlashers(html, HOME_URL, articleUrl, n);

    return Response.json(
      {
        fetchedAt: new Date().toISOString(),
        hero: {
          title: heroBlock.title,
          fullTitle: heroBlock.title,
          titleTranslations: {},
          subTitle: heroBlock.subTitle,
          imageUrl,
          articleUrl,
        },
        flashers,
        meta: {
          homepageUrl: HOME_URL,
          method: 'homepage_scrape',
          flashersReturned: flashers.length,
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

