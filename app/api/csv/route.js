import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Single source of truth for news records (not exposed as a public static file). */
const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'DB.csv');

export async function GET() {
  try {
    if (!existsSync(DB_PATH)) {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }
    const csvText = readFileSync(DB_PATH, 'utf8');
    return new Response(csvText, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error reading DB.csv:', error);
    return new Response('Error', { status: 500 });
  }
}

export async function POST() {
  return new Response(
    'DB.csv: קריאה בלבד דרך GET. עדכון שורות ynet/maariv/walla/israelhayom/hurriyet/jordan_times בסוף GET /api/ynet, /api/maariv, /api/walla, /api/israelhayom, /api/hurriyet או /api/jordantimes.',
    {
      status: 405,
      headers: { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' },
    }
  );
}
