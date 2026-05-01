/**
 * התראות מייל ל-failure ב-cron.
 *
 * משתני סביבה:
 * - ALERT_EMAIL_TO — נמענים מופרדים בפסיק (חובה לשליחה)
 * - RESEND_API_KEY + EMAIL_FROM (או RESEND_FROM) — שליחה דרך Resend (ללא חבילה נוספת)
 *
 * אופציונלי: SMTP דרך nodemailer לא מוגדר כאן — אפשר להוסיף לפי צורך.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ subject: string, textLines: string[] }} opts
 * @returns {Promise<{ sent: boolean, provider?: string, reason?: string }>}
 */
export async function sendAlertEmail({ subject, textLines }) {
  const rawTo = process.env.ALERT_EMAIL_TO || 'dadon.shimon.d@gmail.com';
  const to = rawTo
    ? rawTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!to.length) {
    return { sent: false, reason: 'ALERT_EMAIL_TO לא מוגדר' };
  }

  const key = process.env.RESEND_API_KEY || 're_Hje8G9AJ_7nny4WCyixECxQHDnhx3uLQE';
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'dadon.shimon.d@gmail.com';
  if (!key || !from) {
    return { sent: false, reason: 'חסר RESEND_API_KEY או EMAIL_FROM/RESEND_FROM' };
  }

  const textBody = textLines.join('\n');
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(textBody)}</pre>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: textBody,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${errText.slice(0, 500)}`);
  }

  return { sent: true, provider: 'resend' };
}
