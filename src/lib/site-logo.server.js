import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
export const SITE_LOGO_META_PATH = path.join(process.cwd(), 'data', 'site-logo.json');
export const SITE_LOGO_BASENAME = 'site-logo';

/** @type {Record<string, string>} */
export const ALLOWED_MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** @type {Record<string, string>} */
const EXT_TO_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const DEFAULT_FAVICON = 'https://base44.com/logo_v2.svg';

export function siteLogoMimeType(publicUrl) {
  const ext = path.extname(publicUrl).slice(1).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'image/png';
}

/** @param {string | null} publicUrl @param {string | null} updatedAt */
export function siteLogoAssetHref(publicUrl, updatedAt) {
  if (!publicUrl) return null;
  return updatedAt ? `${publicUrl}?v=${encodeURIComponent(updatedAt)}` : publicUrl;
}

export function defaultFaviconHref() {
  return DEFAULT_FAVICON;
}

export async function readSiteLogoState() {
  try {
    const raw = await fs.readFile(SITE_LOGO_META_PATH, 'utf8');
    const data = JSON.parse(raw);
    const publicUrl =
      typeof data?.publicUrl === 'string' && data.publicUrl.startsWith('/') ? data.publicUrl : null;
    const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : null;
    if (!publicUrl) return { logoUrl: null, updatedAt: null };
    const rel = publicUrl.replace(/^\//, '');
    const full = path.join(PUBLIC_DIR, path.basename(rel));
    try {
      await fs.access(full);
      return { logoUrl: publicUrl, updatedAt };
    } catch {
      return { logoUrl: null, updatedAt: null };
    }
  } catch (e) {
    if (e?.code === 'ENOENT') return { logoUrl: null, updatedAt: null };
    throw e;
  }
}

export async function removeExistingSiteLogoFiles() {
  let entries;
  try {
    entries = await fs.readdir(PUBLIC_DIR);
  } catch (e) {
    if (e?.code === 'ENOENT') return;
    throw e;
  }
  const prefix = `${SITE_LOGO_BASENAME}.`;
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix))
      .map((name) => fs.unlink(path.join(PUBLIC_DIR, name))),
  );
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 */
export async function writeSiteLogo(buffer, mimeType) {
  const ext = ALLOWED_MIME_TO_EXT[mimeType];
  if (!ext) throw new Error('unsupported_mime');
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await removeExistingSiteLogoFiles();
  const filename = `${SITE_LOGO_BASENAME}.${ext}`;
  await fs.writeFile(path.join(PUBLIC_DIR, filename), buffer);
  const publicUrl = `/${filename}`;
  const updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(SITE_LOGO_META_PATH), { recursive: true });
  await fs.writeFile(
    SITE_LOGO_META_PATH,
    `${JSON.stringify({ publicUrl, updatedAt }, null, 2)}\n`,
    'utf8',
  );
  return { publicUrl, updatedAt };
}
