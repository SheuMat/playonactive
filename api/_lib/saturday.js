// Saturday Club pilot details.
// Keep in sync with the CLUB object at the top of assets/js/booking.js.

export const CLUB = {
  name: 'PlayOn Active Saturday Club',
  time: '10:00am – 2:00pm',
  location: 'Southbury Primary School, Swansea Road, Enfield, EN3 4JG',
  ages: 'School Years 1–5 (ages 6–10)',
  currency: 'gbp',
  sessionPrice: 2500, // pence
  blockPrice: 12000, // pence, all five Saturdays
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
