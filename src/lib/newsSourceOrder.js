import { NEWS_SOURCES } from '@/lib/newsSources';

/**
 * @param {unknown} savedKeys
 * @param {typeof NEWS_SOURCES} [catalog]
 * @returns {string[]}
 */
export function mergeOrderWithCatalog(savedKeys, catalog = NEWS_SOURCES) {
  const catalogKeys = catalog.map((s) => s.key);
  const setCatalog = new Set(catalogKeys);
  const seen = new Set();
  const out = [];
  if (Array.isArray(savedKeys)) {
    for (const k of savedKeys) {
      if (typeof k !== 'string' || !setCatalog.has(k) || seen.has(k)) continue;
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of catalogKeys) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

/**
 * @param {typeof NEWS_SOURCES} catalog
 * @param {string[]} keyOrder
 */
export function sortSourcesByKeyOrder(catalog, keyOrder) {
  const byKey = new Map(catalog.map((s) => [s.key, s]));
  return keyOrder.map((k) => byKey.get(k)).filter(Boolean);
}

/**
 * @param {unknown} keys
 * @param {typeof NEWS_SOURCES} [catalog]
 */
export function isValidFullPermutation(keys, catalog = NEWS_SOURCES) {
  const catalogKeys = catalog.map((s) => s.key);
  const setCatalog = new Set(catalogKeys);
  if (!Array.isArray(keys) || keys.length !== setCatalog.size) return false;
  const seen = new Set();
  for (const k of keys) {
    if (typeof k !== 'string' || !setCatalog.has(k) || seen.has(k)) return false;
    seen.add(k);
  }
  return seen.size === setCatalog.size;
}
