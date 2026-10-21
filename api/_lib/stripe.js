// Minimal Stripe REST client (no SDK needed) and webhook signature check.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const API = 'https://api.stripe.com/v1';

// Stripe expects nested form fields: line_items[0][price_data][currency]=gbp
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export const stripeReady = () => Boolean(process.env.STRIPE_SECRET_KEY);
export const stripeTestMode = () => (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');

export async function stripe(path, { method = 'GET', params, idempotencyKey } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Online payments are not set up yet.');
  const headers = { Authorization: `Bearer ${key}` };
  let url = API + path;
  let body;
  if (method === 'GET') {
    if (params) url += '?' + formEncode(params);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = formEncode(params || {});
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(url, { method, headers, body });
  const data = await res.json();
  if (!res.ok) {
    console.error('Stripe error', res.status, data && data.error);
    throw new HttpError(502, 'Our payment provider could not be reached. Please try again in a moment.');
  }
  return data;
}

// Verifies the Stripe-Signature header (t=timestamp,v1=signature).
export function verifyStripeSignature(payload, header, secret, toleranceSec = 300, now = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = null;
  const sigs = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(now - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
