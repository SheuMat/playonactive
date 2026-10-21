// /api/booking-status?session_id=cs_...
// Used by the booking confirmation page to show a short summary after payment.
import { handle, json, HttpError } from './_lib/http.js';
import { stripe } from './_lib/stripe.js';

export const GET = handle(async (request) => {
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id)) throw new HttpError(400, 'Invalid booking link.');
  const s = await stripe(`/checkout/sessions/${id}`);
  const m = s.metadata || {};
  if (m.type !== 'saturday_club') throw new HttpError(404, 'Booking not found.');
  return json({
    ref: m.booking_ref,
    paid: s.payment_status === 'paid',
    option: m.option,
    dates: (m.dates || '').split(',').filter(Boolean),
    // first names only
    children: (m.children || '').split('; ').filter(Boolean).map((c) => c.split(' ')[0]),
    total: s.amount_total,
    email: (s.customer_details && s.customer_details.email) || s.customer_email,
  });
});
