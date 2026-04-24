/**
 * חילוץ כותרת שער ומבזקים מדפי מעריב (HTML סטטי).
 * דף הבית: .top-maariv-container
 * מבזקים: /breaking-news — .breaking-news-link + .breaking-news-title
 */

function decodeHtmlEntities(s) {
  if (!s) return '';
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripTags(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function absolutizeMaarivUrl(href, baseOrigin) {
  if (!href) return null;
  const h = href.trim();
  if (h.startsWith('http://') || h.startsWith('https://')) return h;
  const path = h.startsWith('/') ? h : `/${h}`;
  return `${baseOrigin.replace(/\/+$/, '')}${path}`;
}

/**
 * @param {string} html
 * @param {string} [baseOrigin] — לדוגמה https://www.maariv.co.il
 * @returns {{ title: string, articleUrl: string | null, subTitle: string | null, imageUrl: string | null, imageSource: string | null } | null}
 */
export function extractMaarivHomepageHeroFromHtml(html, baseOrigin = 'https://www.maariv.co.il') {
  if (!html || typeof html !== 'string') return null;

  const tagMatch = html.match(/<article[^>]*class="[^"]*top-maariv-container[^"]*"[^>]*>/i);
  if (!tagMatch) return null;
  const idx = html.indexOf(tagMatch[0]);
  const block = html.slice(idx, idx + 20000);

  const titleM = block.match(/<p class="top-maariv-title"[^>]*>([\s\S]*?)<\/p>/i);
  const teaserM = block.match(/<p class="top-maariv-teaser"[^>]*>([\s\S]*?)<\/p>/i);

  const hrefM = block.match(
    /<section class="top-maariv-content"[\s\S]*?<a[^>]+href="([^"]+)"[\s\S]*?class="top-maariv-title"/i
  );
  const hrefImg = block.match(/<a[^>]+class="[^"]*top-maariv-image-link[^"]*"[^>]+href="([^"]+)"/i);
  const href = hrefM?.[1] || hrefImg?.[1] || null;

  const imgTag = block.match(/<img[^>]*class="[^"]*top-maariv-image[^"]*"[^>]*>/i);
  let imageUrl = null;
  if (imgTag) {
    const tag = imgTag[0];
    const srcSetM = tag.match(/(?:srcSet|srcset)="([^"]+)"/i);
    const srcM = tag.match(/\ssrc="([^"]+)"/i);
    const blob = srcSetM ? srcSetM[1] : srcM ? srcM[1] : '';
    const fromSet = blob.match(/https:\/\/images\.maariv\.co\.il[^"\s]+/i);
    imageUrl = fromSet ? decodeHtmlEntities(fromSet[0]) : null;
  }

  const title = titleM ? stripTags(titleM[1]) : '';
  if (!title) return null;

  return {
    title,
    articleUrl: absolutizeMaarivUrl(href, baseOrigin),
    subTitle: teaserM ? stripTags(teaserM[1]) : null,
    imageUrl,
    imageSource: imageUrl ? 'homepage_html' : null,
  };
}

/**
 * @param {string} html — דף breaking-news
 * @param {number} limit
 * @param {string} [baseOrigin]
 * @returns {{ title: string, articleUrl: string }[]}
 */
export function extractMaarivBreakingItemsFromHtml(html, limit = 40, baseOrigin = 'https://www.maariv.co.il') {
  if (!html || typeof html !== 'string' || limit <= 0) return [];

  const re =
    /<a[^>]+class="[^"]*breaking-news-link[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h2 class="breaking-news-title"[^>]*>([\s\S]*?)<\/h2>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const url = absolutizeMaarivUrl(m[1], baseOrigin);
    const title = stripTags(m[2]);
    if (title && url) out.push({ title, articleUrl: url });
  }
  return out;
}
