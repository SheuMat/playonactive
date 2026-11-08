// /api/signup
// GET  -> whether each day can be booked: { ready, events: { taster: { status }, playday: { status } } }
//         status is open | waitlist | full | closed. Place counts are never sent to the browser.
// POST -> books a child (or two) onto the Taster Day or the Play Day.
//         Taster: confirmed while places last (20 children), otherwise the waiting list.
//         Play Day: saved as awaiting payment; the browser then goes to the Stripe link.
import { handle, json, readJson, makeRef, siteUrl, str, HttpError } from './_lib/http.js';
import { EVENTS, eventFor, capFor, isClosed, fmtMoney } from './_lib/events.js';
import { storeReady, load, mutate } from './_lib/store.js';
import { emailReady } from './_lib/email.js';
import { validateSignup, sameFamily, childNames } from './_lib/signup.js';
import * as B from './_lib/bookings.js';

function statusOf(ev, state, now = Date.now()) {
  if (isClosed(ev, now)) return 'closed';
  const c = B.counts(state, ev);
  if (!c.cap) return 'open';
  const taken = ev.price ? c.awaitingPayment + c.paid : c.confirmed;
  if (taken < c.cap) return 'open';
  return ev.waitlist ? 'waitlist' : 'full';
}

export const GET = handle(async (request) => {
  const ns = B.namespace(new URL(request.url).searchParams.get('test') === '1');
  if (!storeReady() || !emailReady()) return json({ ready: false });
  const events = {};
  for (const ev of Object.values(EVENTS)) events[ev.key] = { status: statusOf(ev, await load(B.keyFor(ns, ev))) };
  return json({ ready: true, events });
});

export const POST = handle(async (request) => {
  const body = await readJson(request);
  // Spam trap: a hidden field people never see.
  if (str(body.website)) return json({ status: 'confirmed', ref: '' });

  const ev = eventFor(body.event);
  if (!ev) throw new HttpError(422, 'Choose which day you’re booking.');
  const ns = B.namespace(body.test === true);
  const data = validateSignup(body);
  B.checkTestRecipient(ns, data.parent.email);
  if (!storeReady() || !emailReady()) throw new HttpError(503, 'Online booking isn’t open just yet. Please try again shortly or contact us.');
  const now = Date.now();
  if (isClosed(ev, now)) throw new HttpError(409, `Online booking for the ${ev.name} has closed.`);

  const ref = makeRef(ev.refPrefix);
  const cancelToken = B.newToken();
  const n = data.children.length;

  const result = await mutate(B.keyFor(ns, ev), (state) => {
    const dup = state.bookings.find((x) => x.status !== 'cancelled' && sameFamily(x, data));
    if (dup) {
      throw new HttpError(409, dup.status === 'waitlist'
        ? `${childNames(dup)} is already on the ${ev.name} waiting list. Check your email for the details.`
        : `${childNames(dup)} is already booked onto the ${ev.name}. Check your email for your confirmation.`);
    }
    const at = new Date(now).toISOString();
    const cap = capFor(ev);
    const b = { ref, event: ev.key, status: 'waitlist', createdAt: at, updatedAt: at, cancelToken, ...data, history: [] };

    if (ev.price) {
      const c = B.counts(state, ev);
      if (cap && c.awaitingPayment + c.paid + n > cap) {
        throw new HttpError(409, c.awaitingPayment + c.paid >= cap
          ? `Sorry, the ${ev.name} is now fully booked.`
          : `Sorry, there aren’t enough places left on the ${ev.name} for ${n} children. Try booking one child, or contact us.`);
      }
      b.status = 'awaiting_payment';
      b.history.push([at, 'Booked online – sent to Stripe to pay']);
      state.bookings.push(b);
      return { booking: b, counts: B.counts(state, ev) };
    }

    state.bookings.push(b);
    if (cap) B.promote(state, ev, now); // confirms this booking if it fits; otherwise it waits in line
    else b.status = 'confirmed';
    b.history = [[at, b.status === 'confirmed' ? 'Booked online – place confirmed' : 'Booked online – joined the waiting list']];
    return { booking: b, counts: B.counts(state, ev) };
  });

  const b = result.booking;
  const base = siteUrl(request);
  const links = {
    cancel: B.cancelUrl(base, ns, b),
    book: `${base}/taster`,
    payments: ev.price ? B.paymentsFor(ev, b) : [],
  };
  const names = childNames(b);
  let subject;
  let intro;
  if (ev.price) {
    const total = fmtMoney(ev.price * n);
    subject = `${ev.name} booking ${b.ref}: ${names} – awaiting ${total}`;
    intro = `New ${ev.name} booking. The parent has been sent to Stripe to pay ${total} (${n > 1 ? `${n} payments of ${fmtMoney(ev.price)}` : 'one payment'}). ` +
      `Look for client reference ${n > 1 ? `${b.ref}-1 and ${b.ref}-2` : b.ref} in Stripe, then mark it paid on the admin page.`;
  } else if (b.status === 'confirmed') {
    subject = `${ev.name} booking ${b.ref}: ${names} (${result.counts.confirmed}/${result.counts.cap} places taken)`;
    intro = `New ${ev.name} booking, place confirmed. Now ${B.placesLine(result.counts)}.`;
  } else {
    subject = `${ev.name} WAITING LIST: ${names} – ${b.ref}`;
    intro = `${ev.name} is full, so this family joined the waiting list. They’ll be given a place automatically if one comes up. Now ${B.placesLine(result.counts)}.`;
  }

  await Promise.all([
    B.emailParent(ev.price ? 'playday' : b.status, ev, b, links, ns),
    B.emailAdmin({ ns, ev, subject, intro, booking: b, adminLink: B.adminUrl(base, ns), idem: `${b.ref}-admin-new` }),
  ]);

  return json({ status: b.status, ref: b.ref, email: b.parent.email, payments: links.payments });
});
