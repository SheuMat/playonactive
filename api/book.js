// /api/book
// GET  -> whether online booking is ready, which options/Saturdays can be booked
// POST -> validates a booking, emails the full details to PlayOn Active, then either
//         - creates a Stripe Checkout session (if STRIPE_SECRET_KEY is set), or
//         - returns the Stripe Payment Link(s) the parent should pay with.
import { handle, json, readJson, makeRef, siteUrl, HttpError } from './_lib/http.js';
import { CLUB, isOpen, fmtShort, fmtMoney, paymentLink } from './_lib/saturday.js';
import { stripe, stripeReady, stripeTestMode } from './_lib/stripe.js';
import { emailReady, sendEmail, businessInbox, layout, para, rowsHtml, rowsText } from './_lib/email.js';
import { validateBooking, bookingRows } from './_lib/booking.js';

const optionAvailable = (option) => stripeReady() || Boolean(paymentLink(option).url);
const options = () => ({ block: optionAvailable('block'), single: optionAvailable('single') });
const ready = () => emailReady() && (options().block || options().single);

export const GET = handle(async () =>
  json({
    ready: ready(),
    mode: stripeReady() ? 'checkout' : 'links',
    testMode: stripeTestMode(),
    options: options(),
    sessions: CLUB.dates.map((date) => ({ date, open: isOpen(date) })),
  })
);

// One payment per place (or one combined payment if the link lets parents set quantity).
function linkPayments(booking, ref) {
  const link = paymentLink(booking.option);
  const unit = booking.option === 'block' ? CLUB.blockPrice : CLUB.sessionPrice;
  const places = booking.option === 'block'
    ? booking.children.map((c) => `${c.first} – all four Saturdays`)
    : booking.children.flatMap((c) => booking.dates.map((d) => `${c.first} – ${fmtShort(d).replace(/ \d{4}$/, '')}`));
  const email = encodeURIComponent(booking.parent.email);
  const urlFor = (id) => `${link.url}?prefilled_email=${email}&client_reference_id=${id}`;
  if (link.adjustable || places.length === 1) {
    return [{ label: places.length === 1 ? places[0] : `${places.length} places`, amount: unit * places.length, quantity: places.length, url: urlFor(ref) }];
  }
  return places.map((label, i) => ({ label, amount: unit, quantity: 1, url: urlFor(`${ref}-${i + 1}`) }));
}

export const POST = handle(async (request) => {
  const booking = validateBooking(await readJson(request));
  if (!emailReady()) throw new HttpError(503, 'Online booking isn’t open just yet. Please send us an enquiry and we’ll be in touch.');
  if (!optionAvailable(booking.option)) {
    throw new HttpError(422, booking.option === 'single'
      ? 'Individual Saturdays can’t be booked online just yet. Please choose all four Saturdays, or send us an enquiry.'
      : 'This option can’t be booked online just yet. Please send us an enquiry.');
  }

  const ref = makeRef('SC');
  const rows = bookingRows(booking, ref);
  let result;
  let paymentNote;

  if (stripeReady()) {
    const base = siteUrl(request);
    const kids = booking.children.length;
    const place = `${CLUB.time}, Southbury Primary School, Enfield`;
    const lineItems = booking.option === 'block'
      ? [{ price_data: { currency: CLUB.currency, unit_amount: CLUB.blockPrice, product_data: { name: 'Saturday Club – all four Saturdays', description: `14 Nov – 5 Dec 2026, ${place}` } }, quantity: kids }]
      : booking.dates.map((d) => ({ price_data: { currency: CLUB.currency, unit_amount: CLUB.sessionPrice, product_data: { name: `Saturday Club – ${fmtShort(d)}`, description: place } }, quantity: kids }));
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
        payment_intent_data: { description: `Saturday Club booking ${ref}`, metadata: { booking_ref: ref } },
        success_url: `${base}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/book-saturday-club?cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
    });
    result = { mode: 'checkout', url: session.url, ref };
    paymentNote = 'The parent has been sent to Stripe to pay. You will get a separate PAID email when payment goes through. If no PAID email arrives, the booking was not completed.';
  } else {
    const payments = linkPayments(booking, ref);
    result = { mode: 'links', ref, total: booking.total, payments };
    const plan = payments.map((p) => `${p.label}: ${fmtMoney(p.amount)}${p.quantity > 1 ? ` (quantity ${p.quantity})` : ''}, reference ${p.url.split('client_reference_id=')[1]}`).join('\n');
    rows.splice(1, 0, { label: 'Expected payment(s)', value: plan });
    paymentNote = `The parent has been sent to the Stripe payment link to pay ${fmtMoney(booking.total)}. ` +
      'Check the payment in your Stripe dashboard: it shows the booking reference as the "Client reference ID". ' +
      'The place is confirmed once the full amount has been paid.';
  }

  await sendEmail({
    to: businessInbox(),
    replyTo: booking.parent.email,
    subject: `Saturday Club booking ${ref} – awaiting payment – ${booking.parent.name}`,
    html: layout(`New booking ${ref} (awaiting payment)`, para(paymentNote) + rowsHtml(rows)),
    text: `${paymentNote}\n${rowsText(rows)}`,
    idempotencyKey: `booking-${ref}`,
  });

  return json(result);
});
