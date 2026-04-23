/**
 * Server-side RSS fetch — avoids browser CORS when the client loads feeds (e.g. ynet.co.il).
 */
export const dynamic = 'force-dynamic';

const ALLOWED_HOST_SUFFIXES = [
  'ynet.co.il',
  'walla.co.il',
  'maariv.co.il',
  'israelhayom.co.il',
  'bbci.co.uk',
  'bbc.co.uk',
  'bbc.com',
  'cnn.com',
  'feeds.bbci.co.uk',
  'rss.cnn.com',
  'foxnews.com',
  'gulfnews.com',
  'thenationalnews.com',
  'english.ahram.org.eg',
  'aawsat.com',
  'irna.ir',
  'bna.bh',
  'moroccoworldnews.com',
  'dailystar.com.lb',
  'sana.sy',
  'wafa.ps',
  'hurriyetdailynews.com',
  'jordantimes.com',
  'sozcu.com.tr',
];

function isAllowedFeedUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

export async function GET(request) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isAllowedFeedUrl(url)) {
    return Response.json(
      { error: 'Missing or disallowed url (RSS feeds from known news hosts only).' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsApp/1.0; +https://example.com)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Upstream HTTP ${res.status}`, status: res.status },
        { status: 502 }
      );
    }

    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('rss-proxy:', e);
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
