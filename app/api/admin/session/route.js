import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session.server';

export async function GET(request) {
  const raw = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(raw);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, username: session.username });
}
