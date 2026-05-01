import { waitUntil } from '@vercel/functions';
import { NEWS_REFRESH_ENDPOINTS } from '@/lib/newsRefreshEndpoints';
import { sendAlertEmail } from '@/lib/alertEmail';

export const dynamic = 'force-dynamic';
/** Vercel Pro+: הרצה ארוכה — עשרות מקורות עם תרגום */
export const maxDuration = 300;

const FETCH_TIMEOUT_MS = Number(process.env.NEWS_REFRESH_TIMEOUT_MS || 180000);

function resolveBaseUrl(request) {
  const explicit =
    process.env.NEWS_REFRESH_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (explicit) return explicit.replace(/\/$/, '');
  return new URL(request.url).origin;
}

function truncateBody(text, max = 800) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * מריץ את כל מחזור העדכון ומחזיר את גוף ה-JSON (בלי Response).
 * @param {string} baseUrl
 */
async function executeRefresh(baseUrl) {
  const modeEach = String(process.env.ALERT_EMAIL_MODE || '').toLowerCase() === 'each';
  const startedAt = Date.now();

  /** @type {{ id: string, path: string, status: number, detail: string }[]} */
  const failures = [];
  /** @type {{ id: string, path: string, ok: true, ms: number }[]} */
  const ok = [];

  for (const { id, path } of NEWS_REFRESH_ENDPOINTS) {
    const url = `${baseUrl}${path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'news-refresh-cron/1.0',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const ms = Date.now() - t0;
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const j = await res.json();
            detail = `${detail} ${truncateBody(JSON.stringify(j))}`;
          } else {
            detail = `${detail} ${truncateBody(await res.text())}`;
          }
        } catch {
          detail = `${detail} (לא ניתן לקרוא גוף תשובה)`;
        }
        const row = { id, path, status: res.status, detail };
        failures.push(row);
        if (modeEach) {
          try {
            await sendAlertEmail({
              subject: `[חדשות] כשל בעדכון: ${id}`,
              textLines: [
                `מקור: ${id}`,
                `נתיב: ${path}`,
                `URL מלא: ${url}`,
                `זמן: ${new Date().toISOString()}`,
                '',
                detail,
              ],
            });
          } catch (e) {
            console.error('alertEmail each:', e);
          }
        }
      } else {
        ok.push({ id, path, ok: true, ms });
      }
    } catch (e) {
      const ms = Date.now() - t0;
      const msg = String(e?.message || e);
      failures.push({ id, path, status: 0, detail: msg });
      if (modeEach) {
        try {
          await sendAlertEmail({
            subject: `[חדשות] כשל בעדכון: ${id}`,
            textLines: [
              `מקור: ${id}`,
              `נתיב: ${path}`,
              `URL מלא: ${url}`,
              `זמן: ${new Date().toISOString()}`,
              `משך עד כשלון: ${ms}ms`,
              '',
              msg,
            ],
          });
        } catch (err) {
          console.error('alertEmail each:', err);
        }
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  let emailResult = null;

  if (failures.length && !modeEach) {
    const lines = [
      `בסיס: ${baseUrl}`,
      `זמן סיום: ${new Date().toISOString()}`,
      `משך כולל: ${elapsedMs}ms`,
      `הצלחות: ${ok.length} / ${NEWS_REFRESH_ENDPOINTS.length}`,
      '',
      'כשלונות:',
      ...failures.map((f) => `--- ${f.id} (${f.path}) ---\n${f.detail}\n`),
    ];
    try {
      emailResult = await sendAlertEmail({
        subject: `[חדשות] עדכון מתוזמן: ${failures.length} כשלונות`,
        textLines: lines,
      });
    } catch (e) {
      emailResult = { sent: false, reason: String(e?.message || e) };
      console.error('alertEmail digest:', e);
    }
  }

  return {
    allSourcesOk: failures.length === 0,
    baseUrl,
    elapsedMs,
    successCount: ok.length,
    failureCount: failures.length,
    failures,
    successes: ok,
    email: modeEach
      ? { mode: 'each', note: 'נשלח מייל לכל כשלון אם הוגדר Resend' }
      : { mode: 'digest', ...emailResult },
  };
}

/**
 * GET — קריאה מתוזמנת (Vercel Cron / cron חיצוני).
 *
 * Query `detach=1` — מחזיר 202 מיד והמשך הריצה ברקע (`waitUntil`), מתאים ל-GitHub Actions שלא ימתין דקות.
 * בלי `detach` — מחזיר 200 עם תוצאות מלאות אחרי סיום (יכול לקחת זמן רב).
 *
 * משתני סביבה:
 * - ALERT_EMAIL_MODE=each — מייל נפרד לכל כשלון (ברירת מחדל: digest אחד)
 */
export async function GET(request) {
  const baseUrl = resolveBaseUrl(request);
  const detach = request.nextUrl.searchParams.get('detach') === '1';

  if (detach) {
    waitUntil(
      executeRefresh(baseUrl)
        .then((body) => {
          console.log('[cron/refresh-news] detach finished', {
            failureCount: body.failureCount,
            elapsedMs: body.elapsedMs,
          });
        })
        .catch((err) => {
          console.error('[cron/refresh-news] detach failed:', err);
        }),
    );

    return Response.json(
      {
        accepted: true,
        mode: 'detach',
        baseUrl,
        note: 'העדכון רץ ברקע (waitUntil). תוצאות בלוגי Vercel / מיילים בשגיאות.',
      },
      {
        status: 202,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  const body = await executeRefresh(baseUrl);
  return Response.json(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
