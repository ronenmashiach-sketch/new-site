/**
 * fetch לשרת Node עם גיבוי HTTPS+IPv4 כש־fetch הבסיסי נכשל (timeout / IPv6).
 * לא לייבא מקומפוננטות לקוח — רק מנתיבי API / מודולי .server או payload שניטענים מהם בלבד.
 */

import https from 'node:https';
import dns from 'node:dns';

export const SERVER_FETCH_TIMEOUT_MS = 65_000;

export function formatNestedFetchError(err) {
  if (!err) return 'unknown error';
  const parts = [];
  if (err.name) parts.push(err.name);
  if (err.message) parts.push(err.message);
  const c = err.cause;
  if (c !== undefined && c !== null) {
    if (typeof c === 'object') {
      if (c.message) parts.push(String(c.message));
      if (c.code) parts.push(`syscall/code:${c.code}`);
      if (c.errno) parts.push(`errno:${c.errno}`);
    } else {
      parts.push(String(c));
    }
  }
  if (err.code) parts.push(`code:${err.code}`);
  return [...new Set(parts)].join(' — ');
}

async function httpsGetIpv4(urlString, headers, redirectLeft = 6) {
  const u = new URL(urlString);
  if (u.protocol !== 'https:') throw new Error('רק https נתמך בגיבוי IPv4');

  let address;
  try {
    const r = await dns.promises.lookup(u.hostname, { family: 4, all: false });
    address = r.address;
  } catch (e) {
    throw new Error(`DNS IPv4: ${formatNestedFetchError(e)}`);
  }

  const pathAndQuery = `${u.pathname}${u.search}`;

  return new Promise((resolve, reject) => {
    const opts = {
      host: address,
      servername: u.hostname,
      port: u.port || 443,
      path: pathAndQuery,
      method: 'GET',
      headers: {
        ...headers,
        Host: u.hostname,
      },
      timeout: SERVER_FETCH_TIMEOUT_MS,
      rejectUnauthorized: true,
    };

    const req = https.request(opts, (res) => {
      const code = res.statusCode || 0;
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(code) && loc && redirectLeft > 0) {
        let nextUrl;
        try {
          nextUrl = new URL(loc, urlString).toString();
        } catch {
          reject(new Error(`redirect לא תקין: ${loc}`));
          return;
        }
        res.resume();
        httpsGetIpv4(nextUrl, headers, redirectLeft - 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', (ch) => chunks.push(ch));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: code >= 200 && code < 400,
          status: code,
          url: urlString,
          text,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTPS timeout אחרי ${SERVER_FETCH_TIMEOUT_MS}ms`));
    });
    req.end();
  });
}

/**
 * @param {Record<string, string>} headers
 */
export async function fetchTextWithIpv4Fallback(url, headers) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), SERVER_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (e) {
    const primary = formatNestedFetchError(e);
    try {
      const r = await httpsGetIpv4(url, headers);
      return r;
    } catch (e2) {
      throw new Error(`${primary} | גיבוי HTTPS ‏IPv4: ${formatNestedFetchError(e2)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {Record<string, string>} headers
 */
export async function fetchWithRetries(url, tries, headers) {
  let lastErr = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await sleep(350 + Math.floor(Math.random() * 900));
      const r = await fetchTextWithIpv4Fallback(url, headers);
      if (r.ok) return r;
      if ([403, 405, 429, 500, 502, 503, 504].includes(r.status)) {
        lastErr = new Error(`HTTP ${r.status}`);
        await sleep(300 * attempt + Math.floor(Math.random() * 700));
        continue;
      }
      return r;
    } catch (e) {
      lastErr = e;
      await sleep(300 * attempt + Math.floor(Math.random() * 900));
    }
  }
  if (lastErr) throw new Error(formatNestedFetchError(lastErr));
  throw new Error('כל ניסיונות הטעינה נכשלו');
}
