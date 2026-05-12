import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 8;

function getSessionSecret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || String(s).length < 4) return null;
  return String(s);
}

export function createAdminSessionToken(username) {
  const secret = getSessionSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SEC;
  const payload = { u: String(username), exp };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyAdminSessionToken(token) {
  const secret = getSessionSecret();
  if (!secret || !token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (typeof payload?.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload?.u !== 'string' || !payload.u) return null;
    return { username: payload.u };
  } catch {
    return null;
  }
}

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  };
}

export function hasAdminSessionSecret() {
  return Boolean(getSessionSecret());
}
