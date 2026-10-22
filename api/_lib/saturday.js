// Saturday Club pilot details.
// Keep in sync with the CLUB object at the top of assets/js/booking.js.

export const CLUB = {
  name: 'PlayOn Active Saturday Club',
  time: '10:00am – 2:00pm',
  location: 'Southbury Primary School, Swansea Road, Enfield, EN3 4JG',
  ages: 'School Years 1–5 (ages 6–10)',
  currency: 'gbp',
  sessionPrice: 2500, // pence
  blockPrice: 11000, // pence, all five Saturdays
  dates: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05'],
  years: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
  maxChildren: 4,
  // Bookings for a Saturday close at 09:00 UK time that morning (GMT = UTC in Nov/Dec).
  cutoff: (date) => Date.parse(`${date}T09:00:00Z`),
};

export const isOpen = (date, now = Date.now()) => now < CLUB.cutoff(date);

export const price = (option, dates, children) =>
  option === 'block' ? CLUB.blockPrice * children : CLUB.sessionPrice * dates.length * children;

export const fmtDate = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });

export const fmtShort = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London',
  });

export const fmtMoney = (pence) => '£' + (pence % 100 ? (pence / 100).toFixed(2) : String(pence / 100));

// Stripe Payment Links, used when no STRIPE_SECRET_KEY is set.
// adjustable = the link lets customers change the quantity on Stripe's page, so a family
// pays for several places in one go; otherwise the site shows one payment per place.
// STRIPE_LINK_BLOCK / STRIPE_LINK_SINGLE / STRIPE_LINKS_ADJUSTABLE in Vercel override these.
const LINKS = {
  block: { url: 'https://buy.stripe.com/3cIeVc3JX7Xe8EKdKW3wQ01', adjustable: false }, // £110, all five Saturdays
  single: { url: 'https://buy.stripe.com/5kQcN480dfpG9IO7my3wQ03', adjustable: true }, // £25, one Saturday
};
export const paymentLink = (option) => {
  const link = LINKS[option] || {};
  const envUrl = option === 'block' ? process.env.STRIPE_LINK_BLOCK : process.env.STRIPE_LINK_SINGLE;
  const envAdjustable = process.env.STRIPE_LINKS_ADJUSTABLE;
  return {
    url: envUrl || link.url || '',
    adjustable: envAdjustable ? envAdjustable === 'true' : Boolean(link.adjustable),
  };
};
