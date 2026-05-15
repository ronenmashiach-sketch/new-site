import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session.server';
import { writeSiteBranding } from '@/lib/site-branding.server';

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

  try {
    const patch = {};
    if (body && 'logoSizePx' in body) patch.logoSizePx = body.logoSizePx;
    if (body && 'siteTitle' in body) patch.siteTitle = body.siteTitle;
    if (body && 'siteSubtitle' in body) patch.siteSubtitle = body.siteSubtitle;
    if (body && 'siteTitleHtml' in body) patch.siteTitleHtml = body.siteTitleHtml;
    if (body && 'siteSubtitleHtml' in body) patch.siteSubtitleHtml = body.siteSubtitleHtml;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, message: 'לא נשלחו שדות לעדכון.' }, { status: 400 });
    }
    const next = await writeSiteBranding(patch);
    return NextResponse.json({ ok: true, ...next });
  } catch (e) {
    if (e?.message === 'invalid_logo_size') {
      return NextResponse.json(
        { ok: false, message: 'גודל לוגו חייב להיות מספר בין 20 ל־96 פיקסלים.' },
        { status: 400 },
      );
    }
    if (e?.message === 'invalid_title_html') {
      return NextResponse.json(
        { ok: false, message: 'שם האתר לא יכול להיות ריק.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, message: 'שגיאת שמירה לקובץ.' }, { status: 500 });
  }
}

