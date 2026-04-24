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

function extractThumbnailUrl(itemXml) {
  const m = itemXml.match(/<(?:media:)?thumbnail\b[^>]*\burl=["']([^"']+)["']/i);
  if (m) return m[1].trim();
  const enc = itemXml.match(
    /<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']*["'])?/i
  );
  if (enc) return enc[1].trim();
  const desc = extractTagBlock(itemXml, 'description');
  const img = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img) return decodeHtmlEntities(img[1].trim());
  return '';
}

function extractItemFields(itemXml) {
  const titleRaw = extractTagBlock(itemXml, 'title');
  const title = decodeHtmlEntities(stripTags(titleRaw));
  const descriptionRaw = extractTagBlock(itemXml, 'description');
  const description = decodeHtmlEntities(stripTags(descriptionRaw));
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
