import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session.server';
import { readOrderedKeys, writeOrderedKeys } from '@/lib/news-source-order.server';
import { isValidFullPermutation } from '@/lib/newsSourceOrder';
import { NEWS_SOURCES } from '@/lib/newsSources';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'נדרשת התחברות מנהל.' }, { status: 401 });
}

export async function GET(request) {
  const raw = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(raw)) return unauthorized();
  try {
    const keys = await readOrderedKeys();
    return NextResponse.json({ ok: true, keys });
  } catch {
    return NextResponse.json({ ok: false, message: 'שגיאת קריאה.' }, { status: 500 });
  }
}

export async function POST(request) {
  const raw = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(raw)) return unauthorized();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'גוף הבקשה אינו JSON תקין.' }, { status: 400 });
  }
  const keys = body?.keys;
  if (!isValidFullPermutation(keys, NEWS_SOURCES)) {
    return NextResponse.json(
      {
        ok: false,
        message: 'רשימת המפתחות חייבת לכלול בדיוק את כל המקורות, פעם אחת לכל מקור.',
      },
      { status: 400 },
    );
  }
  try {
    await writeOrderedKeys(keys);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'שגיאת שמירה לקובץ.' }, { status: 500 });
  }
}
