import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionToken,
  hasAdminSessionSecret,
} from '@/lib/admin-session.server';

function envAdminUsername() {
  const v = process.env.ADMIN_USERNAME;
  return typeof v === 'string' ? v.trim() : '';
}

function envAdminPassword() {
  const v = process.env.ADMIN_PASSWORD;
  return v === undefined || v === null ? '' : String(v);
}

function safeEqualUtf8(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!hasAdminSessionSecret()) {
    return NextResponse.json(
      { ok: false, message: 'השרת לא מוגדר לניהול סשן. הגדרו ADMIN_SESSION_SECRET (לפחות 16 תווים).' },
      { status: 503 },
    );
  }

  const expectedUser = envAdminUsername();
  const expectedPass = envAdminPassword();
  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { ok: false, message: 'חסרים פרטי מנהל בשרת. הגדרו ADMIN_USERNAME ו-ADMIN_PASSWORD ב-.env.' },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'גוף הבקשה אינו JSON תקין.' }, { status: 400 });
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ ok: false, message: 'נא למלא שם משתמש וסיסמה.' }, { status: 400 });
  }

  const userOk = safeEqualUtf8(username, expectedUser);
  const passOk = safeEqualUtf8(password, expectedPass);
  if (!userOk || !passOk) {
    return NextResponse.json({ ok: false, message: 'שם המשתמש או הסיסמה שגויים.' }, { status: 401 });
  }

  const token = createAdminSessionToken(username);
  if (!token) {
    return NextResponse.json({ ok: false, message: 'שגיאה ביצירת סשן.' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions());
  return res;
}
