import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DEFAULT_YNET_URLS } from '@/lib/ynetUrlConfig';

export const dynamic = 'force-dynamic';

const DATA_DIR = join(process.cwd(), 'data');
const CONFIG_FILE = join(DATA_DIR, 'ynet-urls.json');

function readConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_YNET_URLS };
    }
    const raw = readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_YNET_URLS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_YNET_URLS };
  }
}

function isHttpUrl(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** GET — current Ynet site + RSS URLs (merged with defaults). */
export async function GET() {
  const config = readConfig();
  return Response.json(config, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * PUT — update `data/ynet-urls.json` (partial merge).
 * Body: `{ "siteUrl"?: string, "rssUrl"?: string }`
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const next = readConfig();

    if (body.siteUrl !== undefined) {
      if (!isHttpUrl(body.siteUrl)) {
        return Response.json({ error: 'siteUrl must be a valid http(s) URL' }, { status: 400 });
      }
      next.siteUrl = body.siteUrl.trim();
    }
    if (body.rssUrl !== undefined) {
      if (!isHttpUrl(body.rssUrl)) {
        return Response.json({ error: 'rssUrl must be a valid http(s) URL' }, { status: 400 });
      }
      next.rssUrl = body.rssUrl.trim();
    }

    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

    return Response.json(next, { status: 200 });
  } catch (e) {
    console.error('ynet-urls PUT:', e);
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
