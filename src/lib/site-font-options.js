/** @typedef {{ id: string, label: string, stack: string, sample: string }} SiteFontOption */

/** @type {SiteFontOption[]} */
export const SITE_FONT_OPTIONS = [
  { id: 'inter', label: 'Inter (לטינית)', stack: "'Inter', sans-serif", sample: 'BaSaD News' },
  { id: 'hebrew', label: 'Noto Sans Hebrew (עברית)', stack: "'Noto Sans Hebrew', sans-serif", sample: 'חדשות יומיות' },
  { id: 'arabic', label: 'Noto Sans Arabic (ערבית)', stack: "'Noto Sans Arabic', sans-serif", sample: 'أخبار يومية' },
  { id: 'heebo', label: 'Heebo (עברית)', stack: "'Heebo', sans-serif", sample: 'חדשות יומיות' },
  { id: 'rubik', label: 'Rubik (רב-לשוני)', stack: "'Rubik', sans-serif", sample: 'BaSaD News' },
  { id: 'system', label: 'גופן מערכת', stack: 'system-ui, -apple-system, sans-serif', sample: 'BaSaD News' },
  { id: 'serif', label: 'סריף (קלאסי)', stack: "Georgia, 'Times New Roman', serif", sample: 'BaSaD News' },
  { id: 'mono', label: 'מונוספייס (טכני)', stack: "ui-monospace, 'Cascadia Code', monospace", sample: 'BaSaD' },
];

export const DEFAULT_SITE_FONT_FAMILY = 'inter';

const FONT_BY_ID = Object.fromEntries(SITE_FONT_OPTIONS.map((f) => [f.id, f]));

/** @param {unknown} value */
export function sanitizeSiteFontFamily(value) {
  if (typeof value !== 'string') return DEFAULT_SITE_FONT_FAMILY;
  const id = value.trim();
  return FONT_BY_ID[id] ? id : DEFAULT_SITE_FONT_FAMILY;
}

/** @param {unknown} fontFamilyId */
export function resolveSiteFontStack(fontFamilyId) {
  const id = sanitizeSiteFontFamily(fontFamilyId);
  return FONT_BY_ID[id].stack;
}
