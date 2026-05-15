import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session.server';
import { writeFlasherTickerSettings } from '@/lib/flasher-ticker-settings.server';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'נדרשת התחברות מנהל.' }, { status: 401 });
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

  const patch = {};
  if (body && 'speedLevel' in body) patch.speedLevel = body.speedLevel;
  if (body && 'maxFlashersDisplay' in body) patch.maxFlashersDisplay = body.maxFlashersDisplay;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, message: 'לא נשלחו שדות לעדכון.' }, { status: 400 });
  }

  try {
    const next = await writeFlasherTickerSettings(patch);
    return NextResponse.json({ ok: true, ...next });
  } catch (e) {
    if (e?.message === 'invalid_speed_level') {
      return NextResponse.json(
        { ok: false, message: 'מהירות חייבת להיות מספר בין 1 (איטי) ל־20 (הכי מהיר).' },
        { status: 400 },
      );
    }
    if (e?.message === 'invalid_max_flashers') {
      return NextResponse.json(
        { ok: false, message: 'כמות מקסימלית חייבת להיות מספר בין 1 ל־50.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, message: 'שגיאת שמירה לקובץ.' }, { status: 500 });
  }
}
