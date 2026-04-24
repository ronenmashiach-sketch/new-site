/** Host suffixes allowed for server-side RSS fetch / proxy (known news feeds). */
export const ALLOWED_RSS_HOST_SUFFIXES = [
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

export function isAllowedRssHostUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_RSS_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}
