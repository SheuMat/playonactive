// The two bookable days. This file is the source of truth for dates, prices and caps.
//
// To cap the Play Day (the venue holds 30), set cap: 30 below, or set the
// PLAYDAY_CAP environment variable in Vercel. With waitlist: false a full Play Day
// shows "Fully booked"; set waitlist: true to give it a waiting list like the taster.

export const VENUE = 'Southbury Primary School, Swansea Road, Enfield EN3 4JG';
export const YEARS = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
export const MAX_CHILDREN = 2;

export const EVENTS = {
  taster: {
    key: 'taster',
    name: 'Free Taster Day',
    date: '2026-11-28',
    dateLabel: 'Saturday 28 November 2026',
    time: '10am – 2pm',
    price: 0,
    cap: 20, // children, enforced on the server
    waitlist: true,
    refPrefix: 'TD',
  },
  playday: {
    key: 'playday',
    name: 'Play Day',
    date: '2026-12-05',
    dateLabel: 'Saturday 5 December 2026',
    time: '10am – 2pm',
    price: 1000, // pence, per child
    cap: null, // no cap for now (venue max 30)
    waitlist: false,
    refPrefix: 'PD',
    // £10 Stripe Payment Link (one child per payment; no quantity selector)
    paymentLink: 'https://buy.stripe.com/5kQbJ0bcpb9q6wCfT43wQ06',
  },
};

export const eventFor = (key) => (Object.hasOwn(EVENTS, key) ? EVENTS[key] : null);
export const eventForRef = (ref) =>
  Object.values(EVENTS).find((e) => typeof ref === 'string' && ref.startsWith(e.refPrefix + '-')) || null;

export function capFor(ev) {
  const env = Number(process.env[`${ev.key.toUpperCase()}_CAP`]);
  return Number.isInteger(env) && env > 0 ? env : ev.cap;
}

// Online booking closes when the day starts (10am UK time; GMT in Nov/Dec).
export const closesAt = (ev) => Date.parse(`${ev.date}T10:00:00Z`);
export const isClosed = (ev, now = Date.now()) => now >= closesAt(ev);

export const fmtMoney = (pence) => '£' + (pence / 100).toFixed(pence % 100 ? 2 : 0);
