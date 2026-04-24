/**
 * Server-side RSS fetch — avoids browser CORS when the client loads feeds (e.g. ynet.co.il).
 */
import { isAllowedRssHostUrl } from '@/lib/allowedRssHosts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isAllowedRssHostUrl(url)) {
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
