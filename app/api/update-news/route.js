import { NEWS_SOURCES } from '@/lib/newsSources';
import { fetchNewsFromRSS } from '@/utils/rssNewsFetcher';

/**
 * מושך RSS לזיכרון בלבד — לא כותב ל־DB.csv (עדכון: GET /api/ynet, /api/maariv, /api/walla או /api/israelhayom).
 */
export async function POST() {
  try {
    const results = await Promise.all(
      NEWS_SOURCES.map(async (source) => {
        try {
          const data = await fetchNewsFromRSS(source);
          return { source_key: source.key, ok: true, data };
        } catch (err) {
          console.error(`Failed to fetch ${source.name}:`, err);
          return { source_key: source.key, ok: false, error: String(err?.message || err) };
        }
      })
    );

    return Response.json({ updated: false, persisted: false, results }, { status: 200 });
  } catch (error) {
    console.error('Error in update-news:', error);
    return new Response('Error', { status: 500 });
  }
}
