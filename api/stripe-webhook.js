// /api/stripe-webhook
// Stripe calls this when a Checkout payment completes. It emails the parent a
// booking confirmation and tells PlayOn Active the booking is paid.
// Set it up in Stripe: Developers > Webhooks > endpoint URL
//   https://<your-site>/api/stripe-webhook  with events
//   checkout.session.completed and checkout.session.async_payment_succeeded
import { handle, json, escapeHtml, HttpError } from './_lib/http.js';
import { verifyStripeSignature } from './_lib/stripe.js';
import { emailReady, usingTestSender, sendEmail, businessInbox, layout, para, rowsHtml, rowsText } from './_lib/email.js';
import { CLUB, fmtDate, fmtMoney } from './_lib/saturday.js';

const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

export const POST = handle(async (request) => {
  const payload = await request.text();
  const ok = verifyStripeSignature(payload, request.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(payload);
  if (!PAID_EVENTS.includes(event.type)) return json({ received: true });

  const s = event.data.object;
  const m = s.metadata || {};
  if (m.type !== 'saturday_club' || s.payment_status !== 'paid') return json({ received: true });

  // Returning an error makes Stripe retry later (e.g. once email is configured).
  if (!emailReady()) throw new HttpError(500, 'Email not configured');

  const ref = m.booking_ref || s.client_reference_id;
  const parentEmail = (s.customer_details && s.customer_details.email) || s.customer_email;
  const dates = (m.dates || '').split(',').filter(Boolean);
  const total = fmtMoney(s.amount_total || 0);
  const option = m.option === 'block' ? 'All five Saturdays' : 'Individual Saturdays';

  const summary = [
    { heading: 'Your booking' },
    { label: 'Booking reference', value: ref },
    { label: 'Booked', value: option },
    { label: 'Saturdays', value: dates.map(fmtDate).join('\n') },
    { label: 'Children', value: (m.children || '').split('; ').join('\n') },
    { label: 'Time', value: CLUB.time },
    { label: 'Location', value: CLUB.location },
    { label: 'Amount paid', value: total },
  ];

  const parentHtml =
    para(`Hi ${m.parent_name || 'there'},`) +
    para('Thank you for booking PlayOn Active Saturday Club. Your place is confirmed and we can’t wait to see you!') +
    rowsHtml(summary) +
    '<div style="height:18px"></div>' +
    para('We’ll be in touch before your first Saturday with anything you need to know. If you have any questions in the meantime, just reply to this email.') +
    para('Your payment receipt from Stripe will arrive separately.') +
    `<p style="margin:0;color:#566078;font-size:13px">Booking reference: <strong>${escapeHtml(ref)}</strong></p>`;

  const bizRows = [
    ...summary,
    { heading: 'Parent' },
    { label: 'Name', value: m.parent_name },
    { label: 'Email', value: parentEmail },
    { label: 'Phone', value: m.parent_phone },
    { label: 'Stripe payment', value: s.payment_intent || s.id },
  ];
  await sendEmail({
    to: businessInbox(),
    replyTo: parentEmail || undefined,
    subject: `PAID: Saturday Club booking ${ref} – ${total}`,
    html: layout(`Booking ${ref} is paid`, para('Payment has been received. Full child, health and permission details are in the earlier "awaiting payment" email with the same reference.') + rowsHtml(bizRows)),
    text: `Payment received for ${ref}.\n${rowsText(bizRows)}`,
    idempotencyKey: `${event.id}-business`,
  });

  // Parent confirmation is best-effort: if it can't be sent (for example the email
  // domain isn't verified yet), the booking still stands and Stripe's receipt covers it.
  if (parentEmail && !usingTestSender()) {
    try {
      await sendEmail({
        to: parentEmail,
        replyTo: businessInbox()[0],
        subject: `Your Saturday Club booking is confirmed (${ref})`,
        html: layout('Your Saturday Club booking is confirmed', parentHtml),
        text: `Thank you for booking PlayOn Active Saturday Club. Your place is confirmed.\n${rowsText(summary)}\n\nReply to this email if you have any questions.`,
        idempotencyKey: `${event.id}-parent`,
      });
    } catch (err) {
      console.error('Parent confirmation email failed', ref, err.message);
    }
  }

  return json({ received: true });
});
