// Small helpers shared by the API functions. Files in api/_lib are not routes.

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Wrap a handler so thrown HttpErrors become tidy JSON responses.
export const handle = (fn) => async (request) => {
  try {
    return await fn(request);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, details: err.details }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
};

export async function readJson(request, maxBytes = 60000) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'That was too much information to send.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid request.');
  }
}

export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const isEmail = (v) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export const isPhone = (v) => {
  const n = v.replace(/\D/g, '').length;
  return n >= 10 && n <= 15;
};
export const isPostcode = (v) => /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(v);

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeRef = (prefix) =>
  prefix + '-' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => REF_CHARS[b % REF_CHARS.length]).join('');

export const siteUrl = (request) => (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
