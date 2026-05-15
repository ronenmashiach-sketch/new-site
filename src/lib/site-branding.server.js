import { promises as fs } from 'node:fs';
import path from 'node:path';

const BRANDING_PATH = path.join(process.cwd(), 'data', 'site-branding.json');

const DEFAULTS = {
  logoSizePx: 40,
};

function clampInt(value, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

export async function readSiteBranding() {
  try {
    const raw = await fs.readFile(BRANDING_PATH, 'utf8');
    const data = JSON.parse(raw);
    const logoSizePx = clampInt(data?.logoSizePx, 20, 96) ?? DEFAULTS.logoSizePx;
    return { logoSizePx };
  } catch (e) {
    if (e?.code === 'ENOENT') return { ...DEFAULTS };
    return { ...DEFAULTS };
  }
}

export async function writeSiteBranding(partial) {
  const current = await readSiteBranding();
  const next = {
    ...current,
  };

  if ('logoSizePx' in partial) {
    const v = clampInt(partial.logoSizePx, 20, 96);
    if (v == null) throw new Error('invalid_logo_size');
    next.logoSizePx = v;
  }

  await fs.mkdir(path.dirname(BRANDING_PATH), { recursive: true });
  await fs.writeFile(BRANDING_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

