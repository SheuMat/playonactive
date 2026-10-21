// Sends email through Resend (https://resend.com) and builds simple branded templates.
import { HttpError, escapeHtml } from './http.js';

export const emailReady = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_TO);

export const businessInbox = () =>
  (process.env.EMAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function sendEmail({ to, subject, html, text, replyTo, idempotencyKey }) {
  if (!emailReady()) throw new HttpError(503, 'Email is not set up yet.');
  const headers = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 256);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    throw new HttpError(502, 'We couldn’t send your details just now. Please try again in a moment.');
  }
  return res.json();
}

// rows: [{ heading: 'Section' } | { label: 'Name', value: 'Jo' }]
export function rowsHtml(rows) {
  const cells = rows
    .filter((r) => r.heading || (r.value !== undefined && r.value !== ''))
    .map((r) =>
      r.heading
        ? `<tr><td colspan="2" style="padding:18px 0 6px;font-weight:700;color:#18306C;font-size:15px;border-bottom:2px solid #FC8400">${escapeHtml(r.heading)}</td></tr>`
        : `<tr><td style="padding:7px 12px 7px 0;color:#566078;vertical-align:top;width:42%;border-bottom:1px solid #E3E8F2">${escapeHtml(r.label)}</td>` +
          `<td style="padding:7px 0;color:#18213D;vertical-align:top;border-bottom:1px solid #E3E8F2;white-space:pre-wrap">${escapeHtml(r.value)}</td></tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${cells}</table>`;
}

export function rowsText(rows) {
  return rows
    .filter((r) => r.heading || (r.value !== undefined && r.value !== ''))
    .map((r) => (r.heading ? `\n== ${r.heading.toUpperCase()} ==` : `${r.label}: ${r.value}`))
    .join('\n');
}

export function layout(title, innerHtml) {
  return `<!doctype html><html><body style="margin:0;background:#F4F7FD;font-family:Arial,Helvetica,sans-serif;color:#18213D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FD;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#18306C;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:700">PlayOn <span style="color:#FC8400">Active</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;color:#18306C">${escapeHtml(title)}</h1>
${innerHtml}
</td></tr>
<tr><td style="background:#F4F7FD;padding:16px 28px;font-size:12px;color:#566078">PlayOn Active &middot; Developing physical literacy through play</td></tr>
</table></td></tr></table></body></html>`;
}

export const para = (text) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(text)}</p>`;
