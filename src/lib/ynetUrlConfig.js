/** Matches `rssNewsFetcher` default for ynet */
export const DEFAULT_YNET_URLS = {
  siteUrl: 'https://www.ynet.co.il',
  rssUrl: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
};

/**
 * Load Ynet homepage + RSS URLs. Works on server (fs) and in the browser (GET /api/ynet-urls).
 * Uses dynamic import for fs so this module stays safe for client bundles.
 */
export async function getYnetUrlConfig() {
  if (typeof window === 'undefined') {
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      const p = join(process.cwd(), 'data', 'ynet-urls.json');
      const raw = await readFile(p, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_YNET_URLS, ...parsed };
    } catch {
      return { ...DEFAULT_YNET_URLS };
    }
  }

  try {
    const res = await fetch('/api/ynet-urls', { cache: 'no-store' });
    if (!res.ok) return { ...DEFAULT_YNET_URLS };
    const parsed = await res.json();
    return { ...DEFAULT_YNET_URLS, ...parsed };
  } catch {
    return { ...DEFAULT_YNET_URLS };
  }
}
