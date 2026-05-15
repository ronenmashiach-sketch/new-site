const MAX_HTML_LENGTH = 12_000;

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'span',
  'h1',
  'h2',
  'h3',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'text-decoration',
  'letter-spacing',
  'text-align',
]);

function sanitizeStyleAttr(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  const safe = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(key)) continue;
    if (/javascript:|expression\s*\(|url\s*\(/i.test(value)) continue;
    safe.push(`${key}: ${value}`);
  }
  return safe.length ? safe.join('; ') : '';
}

function sanitizeOpeningTag(tag, attrs) {
  const lower = tag.toLowerCase();
  if (!ALLOWED_TAGS.has(lower)) return '';
  if (lower === 'br') return '<br />';

  let style = '';
  const classMatch = /class\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const styleMatch = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);

  if (styleMatch) {
    const cleaned = sanitizeStyleAttr(styleMatch[2] ?? styleMatch[3] ?? '');
    if (cleaned) style = ` style="${cleaned}"`;
  }

  let className = '';
  if (classMatch) {
    const rawClass = (classMatch[2] ?? classMatch[3] ?? '').trim();
    const safeClass = rawClass
      .split(/\s+/)
      .filter((c) => /^[\w-]+$/.test(c))
      .join(' ');
    if (safeClass) className = ` class="${safeClass}"`;
  }

  return `<${lower}${className}${style}>`;
}

/** @param {unknown} html */
export function sanitizeSiteHtml(html) {
  if (typeof html !== 'string') return '';
  let s = html.slice(0, MAX_HTML_LENGTH);
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  s = s.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const slash = match.startsWith('</');
    if (slash) {
      return ALLOWED_TAGS.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : '';
    }
    return sanitizeOpeningTag(tag, attrs);
  });

  return s.trim();
}

/** @param {string} html */
export function stripHtmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isRichHtmlEmpty(html) {
  const text = stripHtmlToPlainText(html);
  return !text;
}
