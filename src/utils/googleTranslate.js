/**
 * Google Translate — אנדפוינט לא־רשמי, ללא מפתח.
 *   GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=he&tl=en&dt=t&q=<text>
 *
 * הערות חשובות:
 *  - זה אנדפוינט לא־רשמי, ייתכן שייחסם או יחזיר 429 בעומס.
 *  - תרגום אחד לשפה אחת בכל קריאה — לכן עבור N שפות שולחים N קריאות במקביל.
 *  - כדי להפחית עומס: קאש בזיכרון (TTL + מגבלת גודל).
 *  - תמיד נכלול User-Agent של דפדפן.
 */

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const CACHE_MAX_ENTRIES = 1000;
const REQUEST_TIMEOUT_MS = 6000;

const cache = new Map();

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return e.v;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { v: value, t: Date.now() });
}

function buildCacheKey(text, from, to) {
  return `${from}::${to}::${text}`;
}

function parseGoogleResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const segments = data[0]
    .map((seg) => (Array.isArray(seg) ? seg[0] : ''))
    .filter((s) => typeof s === 'string');
  if (!segments.length) return null;
  return segments.join('').trim();
}

/** מפרק לטקסט ותגים — Google Translate מחליף לעיתים את ה־a ב־`<a` ל־אות בשפת היעד. */
function splitHtmlTagChunks(s) {
  const re = /<[^>]+>/g;
  const chunks = [];
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) chunks.push({ type: 'text', v: s.slice(last, m.index) });
    chunks.push({ type: 'tag', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length) chunks.push({ type: 'text', v: s.slice(last) });
  return chunks;
}

function chunksIncludeTags(chunks) {
  return chunks.some((c) => c.type === 'tag');
}

/**
 * תרגום כשיש HTML: רק קטעי טקסט נשלחים לתרגום, התגים מועתקים כמו במקור.
 * @param {string} original
 * @param {string} from
 * @param {string[]} targets
 * @returns {Promise<Array<{ lang: string, text: string | null, errors: Record<string, string> }>>}
 */
async function translateOneToManyChunkedHtml(original, from, targets) {
  const chunks = splitHtmlTagChunks(original);
  if (!chunksIncludeTags(chunks)) {
    return null;
  }

  const textChunks = chunks.filter((c) => c.type === 'text');

  return Promise.all(
    targets.map(async (lang) => {
      let firstError;
      const translatedTextParts = await Promise.all(
        textChunks.map(async (c) => {
          const t = c.v;
          if (!String(t).trim()) return t;
          const r = await translateOneLang(t, { from, to: lang });
          if (r.error && !firstError) firstError = r.error;
          return r.text ?? t;
        })
      );
      let ti = 0;
      let out = '';
      for (const c of chunks) {
        if (c.type === 'tag') out += c.v;
        else out += translatedTextParts[ti++] ?? '';
      }
      return { lang, text: out.trim(), error: firstError };
    })
  );
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        Accept: '*/*',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * תרגום של מחרוזת אחת לשפה אחת.
 * @returns {Promise<{ text: string | null, error?: string }>}
 */
export async function translateOneLang(text, { from = 'he', to }) {
  const trimmed = (text || '').trim();
  if (!trimmed || !to) return { text: '' };

  const ck = buildCacheKey(trimmed, from, to);
  const cached = cacheGet(ck);
  if (cached !== null) return { text: cached };

  const url = `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(trimmed)}`;

  let res;
  try {
    res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  } catch (e) {
    return { text: null, error: `network: ${String(e?.message || e)}` };
  }

  if (!res.ok) {
    return { text: null, error: `HTTP ${res.status}` };
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { text: null, error: `parse: ${String(e?.message || e)}` };
  }

  const out = parseGoogleResponse(data);
  if (out === null) return { text: null, error: 'תשובה לא צפויה מהשירות' };

  cacheSet(ck, out);
  return { text: out };
}

/**
 * תרגום מחרוזת אחת לכמה שפות במקביל.
 * @param {string} text
 * @param {{ from?: string, to: string[], preserveHtml?: boolean }} opts
 *   preserveHtml — כשיש תגי HTML (למשל `<a href=...>`), מתרגמים רק את הטקסט ביניהם כדי שלא יישברו התגים.
 * @returns {Promise<{ original: string, translations: Record<string, string|null>, errors: Record<string, string> }>}
 */
export async function translateOneToMany(text, { from = 'he', to = [], preserveHtml = false } = {}) {
  const original = (text || '').trim();
  const targets = (to || []).filter(Boolean);
  if (!original || !targets.length) {
    return { original, translations: {}, errors: {} };
  }

  let results;
  if (preserveHtml && /<[^>]+>/.test(original)) {
    const chunked = await translateOneToManyChunkedHtml(original, from, targets);
    if (chunked) {
      results = chunked.map((row) => ({
        lang: row.lang,
        text: row.text,
        error: row.error,
      }));
    }
  }

  if (!results) {
    results = await Promise.all(
      targets.map((lang) => translateOneLang(original, { from, to: lang }).then((r) => ({ lang, ...r })))
    );
  }

  const translations = {};
  const errors = {};
  for (const r of results) {
    translations[r.lang] = r.text ?? null;
    if (r.error) errors[r.lang] = r.error;
  }
  return { original, translations, errors };
}

/**
 * תרגום כמה מחרוזות ייחודיות לאותן שפות (אצוות קונקרנציה כדי לא להציף את השירות).
 * @param {string[]} strings
 * @param {{ from?: string, to: string[], concurrency?: number, preserveHtml?: boolean }} opts
 * @returns {Promise<{ map: Map<string, Record<string, string|null>>, errors: Array<{ text: string, lang: string, error: string }> }>}
 */
export async function translateManyStrings(strings, opts) {
  const from = opts?.from || 'he';
  const targets = Array.isArray(opts?.to) ? opts.to.filter(Boolean) : [];
  const preserveHtml = Boolean(opts?.preserveHtml);
  const concurrency = Math.max(1, Math.min(12, Number(opts?.concurrency) || 5));

  const map = new Map();
  const errors = [];

  if (!targets.length) {
    return { map, errors };
  }

  const unique = [...new Set((strings || []).map((s) => String(s || '').trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (text) => {
        const r = await translateOneToMany(text, { from, to: targets, preserveHtml });
        map.set(text, r.translations || {});
        for (const [lang, err] of Object.entries(r.errors || {})) {
          if (err) errors.push({ text: text.slice(0, 80), lang, error: err });
        }
      })
    );
  }

  return { map, errors };
}
