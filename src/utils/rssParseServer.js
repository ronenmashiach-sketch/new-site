/**
 * Minimal RSS 2.0 parsing for Node (no DOMParser).
 * Handles CDATA, common namespaces (media:thumbnail), and images inside description HTML.
 */

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
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITY_MAP[name.toLowerCase()] || m);
}

function stripTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** טקסט גלוי מתוך שדה RSS: קודם פענוח &lt; וכו', אחר כך הסרת תגים (אחרת נשאר <a...> אחרי decode). */
export function plainTextFromRssHtml(s) {
  if (!s || typeof s !== 'string') return '';
  return stripTags(decodeHtmlEntities(s.trim()));
}

function unwrapCdata(inner) {
  let t = inner.trim();
  if (t.startsWith('<![CDATA[')) {
    t = t.slice(9);
    const i = t.indexOf(']]>');
    if (i >= 0) t = t.slice(0, i);
  }
  return t.trim();
}

function extractTagBlock(itemXml, localName) {
  const re = new RegExp(
    `<(?:[a-zA-Z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z_][\\w.-]*:)?${localName}>`,
    'i'
  );
  const m = itemXml.match(re);
  return m ? unwrapCdata(m[1]) : '';
}

function extractLink(itemXml) {
  const raw = extractTagBlock(itemXml, 'link');
  const t = raw.trim();
  if (t) return decodeHtmlEntities(t);
  const guid = extractTagBlock(itemXml, 'guid');
  if (guid && /^https?:\/\//i.test(guid.trim())) return guid.trim();
  return '';
}

/**
 * MRSS תמונות (למשל CNN: media:group + כמה media:content medium="image").
 * סורק כל תג content סגור ב־/> — סדר מאפיינים בקובץ אינו קבוע; בוחרים רזולוציה גבוהה כשאפשר.
 */
function scoreMrssImageUrl(u) {
  const lower = String(u || '').toLowerCase();
  if (lower.includes('super-169') || /[/_-]1100x\d+/.test(lower)) return 100;
  if (lower.includes('large-11') || lower.includes('story-body') || lower.includes('full-16')) return 70;
  if (lower.includes('assign') || lower.includes('vertical')) return 40;
  if (lower.includes('hp-video') || lower.includes('video-synd') || lower.includes('live-video')) return 15;
  return 30;
}

function extractMrssImageUrlsFromItem(itemXml) {
  const urls = [];
  /** תגי MRSS: media:content או קידומת אחרת (למשל n0:content ב־XML מנורמל). */
  const re = /<(?:[a-zA-Z_][\w.-]*:)?content\b[^>]*\/?>/gi;
  let m;
  while ((m = re.exec(itemXml)) !== null) {
    const tag = m[0];
    if (!/\bmedium=["']image["']/i.test(tag) && !/\btype=["']image\/[^"']*["']/i.test(tag)) continue;
    const um = tag.match(/\burl=["']([^"']+)["']/i);
    if (um) urls.push(decodeHtmlEntities(um[1].trim()));
  }
  return urls;
}

function pickBestMrssImageUrl(urls) {
  if (!urls.length) return '';
  if (urls.length === 1) return urls[0];
  let best = urls[0];
  let bestScore = scoreMrssImageUrl(best);
  for (let i = 1; i < urls.length; i++) {
    const s = scoreMrssImageUrl(urls[i]);
    if (s > bestScore) {
      bestScore = s;
      best = urls[i];
    }
  }
  return best;
}

function firstImgSrcFromHtmlFragment(html) {
  if (!html) return '';
  const s = String(html);
  const dataSrc = s.match(/\bdata-src=["']([^"']+)["']/i);
  if (dataSrc?.[1]) return decodeHtmlEntities(dataSrc[1].trim());
  const img = s.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img?.[1]) return decodeHtmlEntities(img[1].trim());
  const srcset = s.match(/\bsrcset=["']([^"']+)["']/i);
  if (srcset?.[1]) {
    const firstPart = srcset[1].split(',')[0].trim().split(/\s+/)[0];
    if (firstPart) return decodeHtmlEntities(firstPart);
  }
  return '';
}

function extractThumbnailUrl(itemXml) {
  const m = itemXml.match(/<(?:[a-zA-Z_][\w.-]*:)?thumbnail\b[^>]*\burl=["']([^"']+)["']/i);
  if (m) return m[1].trim();
  const mrssList = extractMrssImageUrlsFromItem(itemXml);
  const mrssBest = pickBestMrssImageUrl(mrssList);
  if (mrssBest) return mrssBest;
  const enc = extractTagBlock(itemXml, 'encoded');
  const fromEncoded = firstImgSrcFromHtmlFragment(enc);
  if (fromEncoded) return fromEncoded;
  const enc2 = itemXml.match(
    /<(?:content:)?encoded\b[^>]*>([\s\S]*?)<\/(?:content:)?encoded>/i
  );
  const fromEncodedLoose = firstImgSrcFromHtmlFragment(enc2 ? enc2[1] : '');
  if (fromEncodedLoose) return fromEncodedLoose;
  const enclosure = itemXml.match(
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']*["'])?/i
  );
  if (enclosure) return enclosure[1].trim();
  const desc = extractTagBlock(itemXml, 'description');
  const fromDesc = firstImgSrcFromHtmlFragment(desc);
  if (fromDesc) return fromDesc;
  /** CNN לעיתים שמים רק קישור cdn בתוך ה־item בלי תג MRSS סטנדרטי. */
  const loose = extractLooseCnnImageUrlsFromItemXml(itemXml);
  const looseBest = pickBestMrssImageUrl(loose);
  if (looseBest) return looseBest;
  return '';
}

/** כתובות תמונה מ־*.cnn.com בתוך פריט RSS (גיבוי לפריסות לא סטנדרטיות). */
function extractLooseCnnImageUrlsFromItemXml(itemXml) {
  const raw = String(itemXml || '');
  const re = /https:\/\/[a-z0-9.-]*cnn\.com\/[^"'<\s\\]+/gi;
  const urls = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    let u = decodeHtmlEntities(m[0].trim()).replace(/&amp;/g, '&');
    u = u.split('?')[0];
    if (!/\.(jpe?g|webp|png)(\s|$)/i.test(u) && !/\/(images?|media)\//i.test(u)) continue;
    urls.push(u);
  }
  return urls;
}

function extractItemFields(itemXml) {
  const titleRaw = extractTagBlock(itemXml, 'title');
  const title = plainTextFromRssHtml(titleRaw);
  const descriptionRaw = extractTagBlock(itemXml, 'description');
  const description = plainTextFromRssHtml(descriptionRaw);
  const pubDate = extractTagBlock(itemXml, 'pubDate').trim();
  const link = extractLink(itemXml);
  const imageUrl = extractThumbnailUrl(itemXml) || null;

  return {
    title,
    description,
    link,
    pubDate: pubDate || null,
    imageUrl,
  };
}

/**
 * @param {string} xmlText
 * @returns {Array<{ title: string, description: string, link: string, pubDate: string | null, imageUrl: string | null }>}
 */
export function parseRssItemsServer(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];

  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xmlText)) !== null) {
    items.push(extractItemFields(m[1]));
  }
  return items;
}
