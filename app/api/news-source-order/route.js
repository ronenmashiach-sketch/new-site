import { NextResponse } from 'next/server';
import { readOrderedKeys } from '@/lib/news-source-order.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const keys = await readOrderedKeys();
    return NextResponse.json({ keys });
  } catch {
    return NextResponse.json({ ok: false, message: 'שגיאת קריאת סדר מקורות.' }, { status: 500 });
  }
}
