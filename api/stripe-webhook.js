// /api/stripe-webhook (optional)
// If a webhook is set up in Stripe (Developers > Webhooks, endpoint
// https://www.playonactive.co.uk/api/stripe-webhook, event checkout.session.completed)
// and STRIPE_WEBHOOK_SECRET is set in Vercel, Play Day payments are marked as paid
// automatically. Without it, mark payments as paid on the admin page.
import { handle, json } from './_lib/http.js';
import { verifyStripeSignature } from './_lib/stripe.js';
import { eventForRef, fmtMoney } from './_lib/events.js';
import { mutate } from './_lib/store.js';
import { childNames } from './_lib/signup.js';
import * as B from './_lib/bookings.js';

const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

export const POST = handle(async (request) => {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return json({ error: 'Invalid signature' }, 400);
  }
  const event = JSON.parse(payload);
  if (!PAID_EVENTS.includes(event.type)) return json({ received: true });

  const s = event.data.object;
  const match = /^(PD-[A-Z0-9]{6})(?:-(\d+))?$/.exec(s.client_reference_id || '');
  if (!match || s.payment_status !== 'paid') return json({ received: true });
  const [, ref, part] = match;
  const ev = eventForRef(ref);
  if (!ev) return json({ received: true });

  const at = new Date().toISOString();
  const b = await mutate(B.keyFor('live', ev), (state) => {
    const x = state.bookings.find((y) => y.ref === ref);
    if (!x) return null;
    x.payments = x.payments || {};
    x.payments[part || '1'] = { amount: s.amount_total, stripe: s.payment_intent || s.id, at };
    const paidAll = Object.keys(x.payments).length >= x.children.length;
    if (paidAll && x.status === 'awaiting_payment') x.status = 'paid';
    x.updatedAt = at;
    x.history.push([at, `Stripe payment received (${fmtMoney(s.amount_total || 0)})${paidAll ? ' – fully paid' : ''}`]);
    return x;
  });
  if (!b) {
    console.error('Payment for unknown booking', s.client_reference_id);
    return json({ received: true });
  }

  await B.emailAdmin({
    ns: 'live', ev,
    subject: `PAID: ${ev.name} ${s.client_reference_id} – ${childNames(b)} – ${fmtMoney(s.amount_total || 0)}`,
    intro: b.status === 'paid' ? 'Payment received. This booking is now fully paid.' : 'Payment received. This family still has another payment to make.',
    booking: b,
    idem: `${event.id}-admin`,
  });
  return json({ received: true });
});
