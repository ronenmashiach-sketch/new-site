import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mergeOrderWithCatalog } from '@/lib/newsSourceOrder';
import { NEWS_SOURCES } from '@/lib/newsSources';

const ORDER_PATH = path.join(process.cwd(), 'data', 'home-news-source-order.json');

export async function readOrderedKeys() {
  try {
    const raw = await fs.readFile(ORDER_PATH, 'utf8');
    const data = JSON.parse(raw);
    const keys = Array.isArray(data?.keys) ? data.keys : [];
    return mergeOrderWithCatalog(keys, NEWS_SOURCES);
  } catch (e) {
    if (e?.code === 'ENOENT') {
      return mergeOrderWithCatalog([], NEWS_SOURCES);
    }
    throw e;
  }
}

/**
 * @param {string[]} keys
 */
export async function writeOrderedKeys(keys) {
  await fs.mkdir(path.dirname(ORDER_PATH), { recursive: true });
  await fs.writeFile(ORDER_PATH, `${JSON.stringify({ keys }, null, 2)}\n`, 'utf8');
}
