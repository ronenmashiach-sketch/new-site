/**
 * התראות מייל ל-failure ב-cron.
 *
 * עדיפות:
 * 1) SMTP (למשל Gmail) — `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` + אופציונלי `SMTP_FROM`
 * 2) Resend — `RESEND_API_KEY` + `EMAIL_FROM` (שולח מדומיין מאומת ב-Resend)
 *
 * תמיד: `ALERT_EMAIL_TO` — נמענים מופרדים בפסיק.
 *
 * Gmail: smtp.gmail.com, 587, סיסמת אפליקציה (לא סיסמת חשבון) — ערכים בלבד ב-env, לא בקוד.
 */

import nodemailer from 'nodemailer';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendViaResend({ to, subject, textBody, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM;
  if (!key || !from) {
    return { ok: false, reason: 'חסר RESEND_API_KEY או EMAIL_FROM/RESEND_FROM' };
  }

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

  return { ok: true };
}

async function sendViaSmtp({ to, subject, textBody, html }) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || pass === undefined || pass === '') {
    return { ok: false, reason: 'חסר SMTP_HOST / SMTP_USER / SMTP_PASS' };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
  const from = process.env.SMTP_FROM?.trim() || process.env.EMAIL_FROM?.trim() || user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text: textBody,
    html,
  });

  return { ok: true };
}

/**
 * @param {{ subject: string, textLines: string[] }} opts
 * @returns {Promise<{ sent: boolean, provider?: string, reason?: string }>}
 */
export async function sendAlertEmail({ subject, textLines }) {
  const rawTo = process.env.ALERT_EMAIL_TO;
  const to = rawTo
    ? rawTo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (!to.length) {
    return { sent: false, reason: 'ALERT_EMAIL_TO לא מוגדר' };
  }

  const textBody = textLines.join('\n');
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(textBody)}</pre>`;

  const wantsSmtp =
    Boolean(process.env.SMTP_HOST?.trim()) &&
    Boolean(process.env.SMTP_USER?.trim()) &&
    process.env.SMTP_PASS !== undefined &&
    String(process.env.SMTP_PASS) !== '';

  if (wantsSmtp) {
    await sendViaSmtp({ to, subject, textBody, html });
    return { sent: true, provider: 'smtp' };
  }

  if (process.env.RESEND_API_KEY) {
    const r = await sendViaResend({ to, subject, textBody, html });
    if (r.ok) return { sent: true, provider: 'resend' };
    return { sent: false, reason: r.reason || 'Resend' };
  }

  return {
    sent: false,
    reason: 'הגדר SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) או RESEND_API_KEY — ראה הערות ב-alertEmail.js',
  };
}
