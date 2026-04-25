/**
 * חילוץ כותרת ראשית מדף הבית של ישראל היום (Next.js + Elementor ב־__NEXT_DATA__).
 * מבזקי דף israelnow לא נטענים ב־SSR — המקור לרשימת מבזקים ב־API הוא RSS (ברירת מחדל rss.xml).
 */

function parseNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function decodeJsonStringFragment(escaped) {
  if (escaped == null) return '';
  try {
    return JSON.parse(`"${escaped}"`);
  } catch {
    return escaped.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '');
  }
}

/**
 * @param {string} html
 * @param {string} [baseOrigin] למשל https://www.israelhayom.co.il
 * @returns {{ title: string, subTitle: string, imageUrl: string, articleUrl: string | null, articleId: string } | null}
 */
export function extractIsraelHayomHomeHeroFromHtml(html, baseOrigin = 'https://www.israelhayom.co.il') {
  const data = parseNextData(html);
  const post = data?.props?.pageProps?.serverData?.post;
  const esRaw = post?.elementorStructure;
  if (!esRaw) return null;

  let flat;
  try {
    const tree = typeof esRaw === 'string' ? JSON.parse(esRaw) : esRaw;
    flat = JSON.stringify(tree);
  } catch {
    return null;
  }

  const idx0 = flat.indexOf('"item_number":0');
  if (idx0 < 0) return null;

  const win = flat.slice(Math.max(0, idx0 - 2500), idx0 + 6000);
  const imgM = win.match(/"section_posts__group--post-media_image":\{"url":"([^"]+)"/);
  const heroTail = flat.slice(idx0, idx0 + 4000);
  const titleM = heroTail.match(/"item_title":"((?:[^"\\]|\\.)*)"/);
  const idM = heroTail.match(/"ID":(\d+)/);
  if (!titleM || !idM) return null;

  const title = decodeJsonStringFragment(titleM[1]).trim();
  let subTitle = '';
  const subMatches = [...heroTail.matchAll(/"section_posts__group--post-title_title":"((?:[^"\\]|\\.)*)"/g)];
  for (const sm of subMatches) {
    const t = decodeJsonStringFragment(sm[1]).trim();
    if (t && t !== title) {
      subTitle = t;
      break;
    }
  }

  const articleId = String(idM[1]);
  const relImg = imgM?.[1];
  let imageUrl = '';
  if (relImg) {
    const path = relImg.startsWith('/') ? relImg : `/${relImg}`;
    try {
      imageUrl = new URL(path, baseOrigin).href;
    } catch {
      imageUrl = `${baseOrigin.replace(/\/$/, '')}${path}`;
    }
  }

  const articleUrl = extractIsraelHayomArticleUrlFromHtml(html, articleId, baseOrigin);

  if (!title) return null;

  return {
    title,
    subTitle,
    imageUrl,
    articleUrl,
    articleId,
  };
}

/**
 * @param {string} html
 * @param {string} articleId
 * @param {string} baseOrigin
 * @returns {string | null}
 */
export function extractIsraelHayomArticleUrlFromHtml(html, articleId, baseOrigin = 'https://www.israelhayom.co.il') {
  const re = new RegExp(`href="(/[^"]*/article/${articleId})(?:\\?[^"]*)?"`, 'i');
  const m = html.match(re);
  if (!m) return null;
  try {
    return new URL(m[1], baseOrigin).href;
  } catch {
    return `${baseOrigin.replace(/\/$/, '')}${m[1]}`;
  }
}
