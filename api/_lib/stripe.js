// Stripe webhook signature check (no SDK needed).
import { createHmac, timingSafeEqual } from 'node:crypto';

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
