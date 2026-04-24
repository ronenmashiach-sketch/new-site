/**
 * כותרת שער מדף הבית של ynet (HTML).
 * תמונה: נמצאת באלמנט <a href=".../article/<id>"> שעוטף את התמונה (סמוך ל־<h1 class="slotTitle">).
 * ב־DOM של ynet יש ל־article href בדרך כלל **שתי הופעות סמוכות**: אחת על הכותרת, אחת על התמונה — נבחר זו שמכילה <img>.
 */

const RE_H1_SLOT = /<h1 class="slotTitle"[^>]*>([\s\S]*?)<\/h1>/i;
const RE_SPAN_TITLE = /data-tb-title[^>]*>([\s\S]*?)<\/span>/i;
const RE_HREF_YNET = /href="(https:\/\/www\.ynet\.co\.il[^"]+)"/gi;

function decodeBasicEntities(s) {
  if (!s) return '';
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripTags(s) {
  return decodeBasicEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function findH1HeroIndex(html) {
  if (!html.match(RE_H1_SLOT)) return -1;
  return html.search(RE_H1_SLOT);
}

function extractTitleFromH1Block(inner) {
  const spanM = inner.match(RE_SPAN_TITLE);
  return spanM ? stripTags(spanM[1]) : stripTags(inner);
}

function extractArticleUrlAroundH1(html, h1Idx) {
  const windowBefore = html.slice(Math.max(0, h1Idx - 22000), h1Idx);
  const hrefs = [...windowBefore.matchAll(RE_HREF_YNET)].map((x) => x[1]);
  return [...hrefs].reverse().find((u) => /\/article\//i.test(u)) || hrefs[hrefs.length - 1] || null;
}

/** כל ההופעות של מחרוזת בטקסט. */
function findAllIndexes(haystack, needle, fromIdx = 0) {
  const out = [];
  if (!needle) return out;
  let i = haystack.indexOf(needle, fromIdx);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + needle.length);
  }
  return out;
}

/**
 * מחפש את ה־<img> בתוך ה־<a href="...articleUrl"> שעוטף את תמונת הכתבה.
 * אסטרטגיה:
 *   1. מאתרים את כל המופעים של `href="<articleUrl>"`.
 *   2. עבור כל מופע, בודקים את 1500 התווים שאחריו — אם יש <img src=ynet-pic> זה הקישור על התמונה.
 *   3. בוחרים את הראשון שמתאים.
 */
function extractHeroImageByArticleHref(html, articleUrl) {
  if (!articleUrl) return null;
  const needle = `href="${articleUrl}"`;
  const positions = findAllIndexes(html, needle);
  for (const p of positions) {
    const slice = html.slice(p, p + 1800);
    const m = slice.match(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"/i);
    if (m) {
      const url = decodeBasicEntities(m[1].trim());
      if (!/logo|CENTRAL_logo|icon|sprite/i.test(url)) return url;
    }
  }
  return null;
}

/** גיבוי: התמונה הראשונה של ynet-pic מיד אחרי ה־h1 (אם המבנה השתנה). */
function extractHeroImageFallbackAfterH1(html, h1Idx) {
  const after = html.slice(h1Idx, h1Idx + 8000);
  const m = after.match(/<img[^>]+(?:src|data-src)="(https:\/\/ynet-pic[^"]+)"/i);
  if (!m) return null;
  const url = decodeBasicEntities(m[1].trim());
  if (/logo|CENTRAL_logo|icon|sprite/i.test(url)) return null;
  return url;
}

function extractSubTitleAfterH1(afterH1) {
  const subM1 = afterH1.match(/<\/h1>\s*<div class="slotSubTitle"[^>]*>[\s\S]*?>([^<]+)</i);
  if (subM1) return stripTags(subM1[1]);
  const subM2 = afterH1.match(/class="slotSubTitle"[^>]*>[\s\S]*?data-tb-title[^>]*>([\s\S]*?)<\/span>/i);
  if (subM2) return stripTags(subM2[1]);
  return null;
}

/**
 * @param {string} html — דף הבית המלא
 * @returns {{ title: string, articleUrl: string | null, subTitle: string | null, imageUrl: string | null, imageSource: string | null } | null}
 */
export function extractYnetHomepageHeroFromHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const h1m = html.match(RE_H1_SLOT);
  if (!h1m) return null;

  const title = extractTitleFromH1Block(h1m[1]);
  if (!title) return null;

  const h1Idx = findH1HeroIndex(html);
  if (h1Idx < 0) return null;

  const articleUrl = extractArticleUrlAroundH1(html, h1Idx);

  let imageUrl = extractHeroImageByArticleHref(html, articleUrl);
  if (!imageUrl) imageUrl = extractHeroImageFallbackAfterH1(html, h1Idx);

  const subTitle = extractSubTitleAfterH1(html.slice(h1Idx, h1Idx + 6000));

  return {
    title,
    articleUrl,
    subTitle,
    imageUrl,
    imageSource: imageUrl ? 'homepage_html' : null,
  };
}
