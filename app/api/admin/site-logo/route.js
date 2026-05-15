import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session.server';
import { ALLOWED_MIME_TO_EXT, writeSiteLogo } from '@/lib/site-logo.server';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'נדרשת התחברות מנהל.' }, { status: 401 });
}

export async function POST(request) {
  const raw = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(raw)) return unauthorized();

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'גוף הבקשה אינו תקין.' }, { status: 400 });
  }

  const file = formData.get('logo');
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ ok: false, message: 'יש לבחור קובץ תמונה.' }, { status: 400 });
  }

  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
  if (!ALLOWED_MIME_TO_EXT[type]) {
    return NextResponse.json(
      {
        ok: false,
        message: 'סוג הקובץ אינו נתמך. השתמשו ב־PNG, JPEG, WebP, GIF או SVG.',
      },
      { status: 400 },
    );
  }

  let buffer;
  try {
    const ab = await file.arrayBuffer();
    buffer = Buffer.from(ab);
  } catch {
    return NextResponse.json({ ok: false, message: 'לא ניתן לקרוא את הקובץ.' }, { status: 400 });
  }

  if (buffer.length === 0) {
    return NextResponse.json({ ok: false, message: 'הקובץ ריק.' }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, message: 'הקובץ גדול מדי (מקסימום כ־2 מ״ב).' },
      { status: 400 },
    );
  }

  try {
    const { publicUrl, updatedAt } = await writeSiteLogo(buffer, type);
    return NextResponse.json({ ok: true, logoUrl: publicUrl, updatedAt });
  } catch (e) {
    if (e?.message === 'unsupported_mime') {
      return NextResponse.json({ ok: false, message: 'סוג התמונה אינו נתמך.' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: 'שגיאת שמירה לקובץ.' }, { status: 500 });
  }
}
