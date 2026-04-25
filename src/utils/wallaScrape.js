/**
 * חילוץ כותרת שער מ־www.walla.co.il ומבזקים מ־news.walla.co.il/breaking (HTML).
 * גיבוי מבזקים: שורת המבזקים בדף הבית (item-collection-1) או RSS.
 */

function decodeHtmlEntities(s) {
  if (!s) return '';
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function absolutizeWallaPath(href, baseOrigin) {
  if (!href) return null;
  const h = href.trim();
  if (h.startsWith('http://') || h.startsWith('https://')) return h;
  const path = h.startsWith('/') ? h : `/${h}`;
  return `${baseOrigin.replace(/\/+$/, '')}${path}`;
}

/** בוחר כתובת תמונה בעלת w_NNN מקסימלי בנתיב (srcSet של walla כולל פסיקים בתוך ה־URL). */
export function pickBestWallaImageFromSrcSet(srcSetBlob) {
  if (!srcSetBlob || typeof srcSetBlob !== 'string') return null;
  const urls = [...srcSetBlob.matchAll(/https:\/\/images\.wcdn\.co\.il\/[^\s"'<>]+/g)].map((m) =>
    decodeHtmlEntities(m[0].replace(/[,]+$/, ''))
  );
  let bestUrl = null;
  let bestW = 0;
  for (const url of urls) {
    const dm = url.match(/w_(\d+)/i);
    const w = dm ? parseInt(dm[1], 10) : 0;
    if (!Number.isNaN(w) && w > bestW) {
      bestW = w;
      bestUrl = url;
    }
  }
  return bestUrl || null;
}

/**
 * @param {string} html — דף הבית walla.co.il
 * @returns {{ title: string, articleUrl: string | null, subTitle: string | null, imageUrl: string | null, imageSource: string | null } | null}
 */
export function extractWallaHomepageHeroFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  /** לא `search('drama-wide-wrapper')` — המחרוזת מופיעה גם ב-CSS (.drama-wide-wrapper{). */
  const sectionM = html.match(/<section[^>]*\bdrama-wide-wrapper\b[^>]*>/i);
  if (!sectionM || sectionM.index == null) return null;
  const block = html.slice(sectionM.index, sectionM.index + 45000);

  const hrefM = block.match(
    /<div class="media-wrap">[\s\S]*?<a\s+href="(https:\/\/[^"]+\.walla\.co\.il\/item\/\d+)"/i
  );
  const articleUrl = hrefM ? hrefM[1].trim() : null;

  const h2M = block.match(/<article[^>]*>[\s\S]*?<a[^>]+href="[^"]*"[^>]*>\s*<h2>([\s\S]*?)<\/h2>/i);
  const title = h2M ? stripTags(h2M[1]) : '';
  if (!title) return null;

  let subTitle = null;
  const subM = block.match(/<article[^>]*>[\s\S]*?<\/h2>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (subM) {
    const sub = stripTags(subM[1]);
    if (sub) subTitle = sub;
  }

  /** תמונות השער: רק בתוך ה־media-wrap של השקופית הראשונה (עד media-slider-indicator). */
  const mediaWrapM = block.match(
    /<div class="media-wrap">([\s\S]*?)<ul class="media-slider-indicator"/i
  );
  const heroMediaChunk = mediaWrapM ? mediaWrapM[1] : block;

  /** וואלה משתמשים בתמונה תחת wrap-sub-image (לא בתמונה של main-media עם אייקון ניגון). */
  let imageUrl = null;
  let imageSource = null;
  const wrapSubIdx = heroMediaChunk.search(/<div[^>]*\bclass="[^"]*\bwrap-sub-image\b[^"]*"/i);

  if (wrapSubIdx >= 0) {
    const wrapChunk = heroMediaChunk.slice(wrapSubIdx, wrapSubIdx + 12000);
    const subImgM = wrapChunk.match(/<img[^>]*\bsrc[Ss]et="([^"]+)"/i);
    if (subImgM) {
      imageUrl = pickBestWallaImageFromSrcSet(subImgM[1]);
      if (imageUrl) imageSource = 'homepage_wrap_sub_image';
    }
  }
  if (!imageUrl) {
    const mainMediaM = heroMediaChunk.match(
      /<picture[^>]*\bmain-media\b[^>]*>[\s\S]*?src[Ss]et="([^"]+)"/i
    );
    const blob = mainMediaM?.[1];
    if (blob) {
      imageUrl = pickBestWallaImageFromSrcSet(blob);
      if (imageUrl) imageSource = 'homepage_main_media';
    }
  }

  return {
    title,
    articleUrl,
    subTitle,
    imageUrl,
    imageSource,
  };
}

/**
 * בדף הבית לעיתים אין ב־SSR את `wrap-sub-image` (רק אחרי הידרציה), ואז נופלים ל־main-media שהוא פריים וידאו.
 * דף הכתבה כולל `og:image` — בדרך כלל אותה תמונה כמו ב־wrap-sub-image.
 * אם כבר חילצנו מתוך wrap-sub-image — לא מחליפים.
 */
export async function fillWallaHeroImageFromArticlePage(hero) {
  if (!hero?.articleUrl) return hero;
  if (hero.imageSource === 'homepage_wrap_sub_image' && hero.imageUrl) return hero;
  try {
    const u = new URL(hero.articleUrl);
    const h = u.hostname.toLowerCase();
    if (h !== 'walla.co.il' && !h.endsWith('.walla.co.il')) return hero;

    const res = await fetch(hero.articleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
      cache: 'no-store',
    });
    if (!res.ok) return hero;
    const html = await res.text();
    const og =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    const raw = og?.[1]?.trim();
    if (!raw || !/^https:\/\/images\.wcdn\.co\.il\//i.test(raw)) return hero;
    return { ...hero, imageUrl: decodeHtmlEntities(raw), imageSource: 'article_og_image' };
  } catch {
    return hero;
  }
}

/**
 * מבזקים מדף news.walla.co.il/breaking (קישורים יחסיים /break/ID).
 * @param {string} html
 * @param {number} limit
 * @param {string} [baseOrigin] — https://news.walla.co.il
 */
export function extractWallaBreakingPageItemsFromHtml(html, limit = 40, baseOrigin = 'https://news.walla.co.il') {
  if (!html || typeof html !== 'string' || limit <= 0) return [];

  const re =
    /<a\s+href="(\/break\/\d+)"[^>]*>[\s\S]*?<h1 class="breaking-item-title"[^>]*>([\s\S]*?)<\/h1>/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const articleUrl = absolutizeWallaPath(m[1], baseOrigin);
    if (!articleUrl || seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    const title = stripTags(m[2]);
    if (title && articleUrl) out.push({ title, articleUrl });
  }
  return out;
}

/**
 * שורת המבזקים בדף הבית (אותו תוכן כמו הטיקר ליד "מבזקי חדשות").
 * @param {string} html
 * @param {number} limit
 */
export function extractWallaHomepageNewsflashFromHtml(html, limit = 40) {
  if (!html || typeof html !== 'string' || limit <= 0) return [];

  const idx = html.indexOf('item-collection-1');
  if (idx < 0) return [];
  const block = html.slice(idx, idx + 15000);

  const re =
    /<a\s+href="(https:\/\/news\.walla\.co\.il\/break\/\d+)"[^>]*>[\s\S]*?<span class="title">([\s\S]*?)<\/span>/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null && out.length < limit) {
    const articleUrl = m[1].trim();
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    const title = stripTags(m[2]);
    if (title && articleUrl) out.push({ title, articleUrl });
  }
  return out;
}
