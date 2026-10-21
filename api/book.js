// /api/book
// GET  -> whether online booking is ready, and which Saturdays can still be booked
// POST -> validates a booking, emails the full details to PlayOn Active,
//         and returns a Stripe Checkout URL for payment
import { handle, json, readJson, makeRef, siteUrl, HttpError } from './_lib/http.js';
import { CLUB, isOpen, fmtShort } from './_lib/saturday.js';
import { stripe, stripeReady, stripeTestMode } from './_lib/stripe.js';
import { emailReady, sendEmail, businessInbox, layout, para, rowsHtml, rowsText } from './_lib/email.js';
import { validateBooking, bookingRows } from './_lib/booking.js';

const ready = () => stripeReady() && emailReady();

export const GET = handle(async () =>
  json({
    ready: ready(),
    testMode: stripeTestMode(),
    sessions: CLUB.dates.map((date) => ({ date, open: isOpen(date) })),
  })
);

export const POST = handle(async (request) => {
  const booking = validateBooking(await readJson(request));
  if (!ready()) throw new HttpError(503, 'Online booking isn’t open just yet. Please send us an enquiry and we’ll be in touch.');

  const ref = makeRef('SC');
  const base = siteUrl(request);
  const kids = booking.children.length;
  const place = `${CLUB.time}, Southbury Primary School, Enfield`;

  const lineItems =
    booking.option === 'block'
      ? [{
          price_data: {
            currency: CLUB.currency,
            unit_amount: CLUB.blockPrice,
            product_data: { name: 'Saturday Club – all five Saturdays', description: `7 Nov – 5 Dec 2026, ${place}` },
          },
          quantity: kids,
        }]
      : booking.dates.map((d) => ({
          price_data: {
            currency: CLUB.currency,
            unit_amount: CLUB.sessionPrice,
            product_data: { name: `Saturday Club – ${fmtShort(d)}`, description: place },
          },
          quantity: kids,
        }));

  const session = await stripe('/checkout/sessions', {
    method: 'POST',
    idempotencyKey: `checkout-${ref}`,
    params: {
      mode: 'payment',
      locale: 'en-GB',
      customer_email: booking.parent.email,
      client_reference_id: ref,
      line_items: lineItems,
      metadata: {
        type: 'saturday_club',
        booking_ref: ref,
        option: booking.option,
        dates: booking.dates.join(','),
        children: booking.children.map((c) => `${c.first} ${c.last} (${c.year})`).join('; ').slice(0, 500),
        parent_name: booking.parent.name,
        parent_phone: booking.parent.phone,
      },
      payment_intent_data: {
        description: `Saturday Club booking ${ref}`,
        metadata: { booking_ref: ref },
      },
      success_url: `${base}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/book-saturday-club?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  });

  // Full details (including health information) go to PlayOn Active's inbox now,
  // so nothing is lost. A separate "PAID" email follows once Stripe confirms payment.
  const rows = bookingRows(booking, ref);
  const intro = 'A parent has started a Saturday Club booking and has been sent to Stripe to pay. ' +
    'You will get a separate PAID email when payment goes through. If no PAID email arrives, the booking was not completed.';
  await sendEmail({
    to: businessInbox(),
    replyTo: booking.parent.email,
    subject: `Saturday Club booking ${ref} – awaiting payment – ${booking.parent.name}`,
    html: layout(`New booking ${ref} (awaiting payment)`, para(intro) + rowsHtml(rows)),
    text: `${intro}\n${rowsText(rows)}`,
    idempotencyKey: `booking-${ref}`,
  });

  return json({ url: session.url, ref });
});
