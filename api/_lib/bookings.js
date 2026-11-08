// Booking logic shared by /api/signup, /api/cancel, /api/admin and the Stripe webhook:
// places and the waiting list, cancel links, admin sign-in links and all emails.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, escapeHtml } from './http.js';
import { sendEmail, businessInbox, layout, para, rowsHtml, rowsText } from './email.js';
import { VENUE, capFor, fmtMoney } from './events.js';
import { detailRows, childNames, firstName } from './signup.js';
import { mutate } from './store.js';

/* ---------- Namespaces: live bookings, plus a short-lived test area ---------- */

// Test bookings (?test=1) go to a separate store that never touches real places.
// Emails are only sent to Resend's test inboxes or the business inbox. This switch
// turns itself off after this date.
export const TEST_UNTIL = Date.parse('2026-11-12T00:00:00Z');
export const TEST_SINK = 'delivered@resend.dev';

export function namespace(testFlag, now = Date.now()) {
  if (!testFlag) return 'live';
  if (now > TEST_UNTIL) throw new HttpError(403, 'Test bookings are switched off.');
  return 'test';
}
export const keyFor = (ns, ev) => `poa:${ns}:${ev.key}`;

export function checkTestRecipient(ns, email) {
  if (ns !== 'test') return;
  if (!/@resend\.dev$/i.test(email) && !businessInbox().includes(email)) {
    throw new HttpError(422, 'Test bookings can only use resend.dev or business email addresses.');
  }
}

/* ---------- Places ---------- */

export const childrenWith = (state, status) =>
  state.bookings.filter((b) => b.status === status).reduce((n, b) => n + b.children.length, 0);

export function counts(state, ev) {
  return {
    cap: capFor(ev),
    confirmed: childrenWith(state, 'confirmed'),
    waitlist: childrenWith(state, 'waitlist'),
    awaitingPayment: childrenWith(state, 'awaiting_payment'),
    paid: childrenWith(state, 'paid'),
  };
}

// Fills free places from the waiting list, oldest first. A family that needs more
// places than are free keeps its position; the next family that fits is offered the place.
export function promote(state, ev, now = Date.now()) {
  const cap = capFor(ev);
  let free = cap - childrenWith(state, 'confirmed');
  const promoted = [];
  for (const b of state.bookings) {
    if (free <= 0) break;
    if (b.status === 'waitlist' && b.children.length <= free) {
      b.status = 'confirmed';
      b.updatedAt = new Date(now).toISOString();
      b.history.push([b.updatedAt, 'Given a place from the waiting list']);
      free -= b.children.length;
      promoted.push(b);
    }
  }
  return promoted;
}

export const newToken = () => randomBytes(18).toString('base64url');

export function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Removes the secret cancel token before a booking leaves the server.
export const publicCopy = ({ cancelToken, ...rest }) => JSON.parse(JSON.stringify(rest));

/* ---------- Admin sign-in links ---------- */

const adminSecret = () => {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  if (process.env.RESEND_API_KEY) return createHash('sha256').update('poa-admin|' + process.env.RESEND_API_KEY).digest('hex');
  return '';
};
const ADMIN_DAYS = 14;

export function adminToken(now = Date.now()) {
  const exp = Math.floor(now / 1000) + ADMIN_DAYS * 86400;
  const sig = createHmac('sha256', adminSecret()).update(`admin.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function adminTokenValid(token, now = Date.now()) {
  if (!adminSecret() || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!/^\d{10}$/.test(exp || '') || Number(exp) * 1000 < now) return false;
  const expected = createHmac('sha256', adminSecret()).update(`admin.${exp}`).digest('base64url');
  return tokenMatches(sig, expected);
}

export const adminUrl = (base, ns) => `${base}/admin?key=${adminToken()}${ns === 'test' ? '&test=1' : ''}`;
export const cancelUrl = (base, ns, b) =>
  `${base}/cancel?ref=${b.ref}&t=${b.cancelToken}${ns === 'test' ? '&test=1' : ''}`;

/* ---------- Play Day payments ---------- */

// The £10 link has no quantity selector, so each child is a separate payment.
export function paymentsFor(ev, b) {
  const email = encodeURIComponent(b.parent.email);
  const many = b.children.length > 1;
  return b.children.map((c, i) => ({
    label: `${ev.name} – ${firstName(c.name)}`,
    amount: ev.price,
    url: `${ev.paymentLink}?prefilled_email=${email}&client_reference_id=${many ? `${b.ref}-${i + 1}` : b.ref}`,
  }));
}

/* ---------- Emails ---------- */

const replyTo = () => process.env.EMAIL_REPLY_TO || 'hello@playonactive.co.uk';

const button = (url, label, color = '#FC8400', ink = '#18306C', border = color) =>
  `<p style="margin:22px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:${ink};border:2px solid ${border};font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px">${escapeHtml(label)}</a></p>`;
const outline = (url, label) => button(url, label, '#ffffff', '#18306C', '#18306C');
const small = (html) => `<p style="margin:18px 0 0;color:#566078;font-size:13px;line-height:1.5">${html}</p>`;
const box = (html) => `<div style="margin:20px 0;padding:16px 18px;background:#FFF1E0;border-radius:12px;line-height:1.55">${html}</div>`;

const dayRows = (ev, b) => [
  { heading: 'Booking details' },
  { label: 'Booking reference', value: b.ref },
  { label: 'Day', value: `${ev.name}, ${ev.dateLabel}` },
  { label: 'Time', value: ev.time },
  { label: 'Venue', value: VENUE },
  { label: b.children.length > 1 ? 'Children' : 'Child', value: b.children.map((c) => `${c.name} (${c.year})`).join('\n') },
];

const BRING = 'Please bring a packed lunch and a water bottle. A light snack is provided.';
const PROMO = 'After the Taster Day we’ll email you a quick feedback survey. Complete it and you can book the Play Day on Saturday 5 December for just £5 (usually £10). Please don’t book the Play Day yet: your £5 link will be sent after you complete the survey.';

// Resend's test inboxes are only used by test bookings: those emails are skipped
// (logged as sent) so a test run doesn't use up the daily sending allowance.
const simulated = (to) => [].concat(to).every((t) => /@resend\.dev$/i.test(t));

async function sendSafe(opts) {
  if (simulated(opts.to)) {
    console.log('Simulated test email:', opts.subject);
    return true;
  }
  try {
    await sendEmail({ replyTo: replyTo(), ...opts });
    return true;
  } catch (err) {
    console.error('Email failed', opts.subject, err.message);
    return false;
  }
}

const isAre = (b) => (b.children.length > 1 ? 'have' : 'has');

export function parentEmail(kind, ev, b, links) {
  const hi = para(`Hi ${firstName(b.parent.name)},`);
  const names = childNames(b);
  const rows = dayRows(ev, b);
  let subject; let title; let body; let text;

  if (kind === 'confirmed' || kind === 'promoted') {
    const promoted = kind === 'promoted';
    subject = promoted
      ? `You’ve got a place! ${ev.name} – ${ev.dateLabel.replace(/ \d{4}$/, '')}`
      : `Your ${ev.name} place is confirmed – ${ev.dateLabel.replace(/ \d{4}$/, '')}`;
    title = promoted ? 'You’ve got a place!' : 'Your place is confirmed';
    const lead = promoted
      ? `Good news: a place has come up on the ${ev.name} and it’s yours. ${names} ${isAre(b)} now booked in, so there’s nothing else you need to do.`
      : `Thank you for booking. ${names} ${isAre(b)} a place at the PlayOn Active ${ev.name}.`;
    body = hi + para(lead) + rowsHtml(rows) + '<div style="height:16px"></div>' + para(BRING) + box(escapeHtml(PROMO)) +
      para('Can’t make it any more? Please cancel so another child can have the place.') +
      outline(links.cancel, 'Cancel my booking') +
      small('Any questions? Just reply to this email.');
    text = `${lead}\n${rowsText(rows)}\n\n${BRING}\n\n${PROMO}\n\nCan’t make it? Cancel here so another child can have the place: ${links.cancel}`;
  } else if (kind === 'waitlist') {
    subject = `You’re on the ${ev.name} waiting list`;
    title = 'You’re on the waiting list';
    const lead = `The ${ev.name} is full at the moment, so we’ve added ${names} to the waiting list. If a place comes up it will be given to you automatically, in the order people joined, and we’ll email you straight away.`;
    body = hi + para(lead) + rowsHtml(rows) + '<div style="height:16px"></div>' +
      para('If you no longer need a place, please leave the waiting list so the next family can be offered it.') +
      outline(links.cancel, 'Leave the waiting list') +
      small('Any questions? Just reply to this email.');
    text = `${lead}\n${rowsText(rows)}\n\nLeave the waiting list: ${links.cancel}`;
  } else if (kind === 'cancelled') {
    const wasWaiting = b.cancelledFrom === 'waitlist';
    subject = wasWaiting ? `You’ve left the ${ev.name} waiting list` : `Your ${ev.name} booking is cancelled`;
    title = wasWaiting ? 'You’ve left the waiting list' : 'Your booking is cancelled';
    const lead = wasWaiting
      ? `We’ve removed ${names} from the ${ev.name} waiting list (reference ${b.ref}).`
      : `We’ve cancelled ${names}’s place at the ${ev.name} (reference ${b.ref}). Thank you for letting us know, it means another child can come.`;
    body = hi + para(lead) + para('Changed your mind? Book again on our website while places last.') + button(links.book, 'Book again') +
      small('Didn’t cancel this? Reply to this email and we’ll sort it out.');
    text = `${lead}\n\nBook again: ${links.book}`;
  } else if (kind === 'playday') {
    subject = `Your ${ev.name} booking – ${ev.dateLabel.replace(/ \d{4}$/, '')}`;
    title = `Thanks for booking the ${ev.name}`;
    const total = fmtMoney(ev.price * b.children.length);
    const lead = `Thank you for booking the PlayOn Active ${ev.name} for ${names}. Your place is secured once payment (${total}) is complete. If you’ve already paid, there’s nothing more to do and Stripe will email your receipt.`;
    const pay = links.payments.map((p) => button(p.url, `Pay ${fmtMoney(p.amount)} – ${p.label.split(' – ').pop()}`)).join('');
    body = hi + para(lead) + rowsHtml([...rows, { label: 'Price', value: `${fmtMoney(ev.price)} per child (${total})` }]) +
      '<div style="height:10px"></div>' + para(links.payments.length > 1 ? 'Not paid yet? Please make one payment per child:' : 'Not paid yet?') + pay +
      para(BRING) + small('Need to change or cancel? Just reply to this email.');
    text = `${lead}\n${rowsText(rows)}\n\nPay: ${links.payments.map((p) => `${p.label}: ${p.url}`).join('\n')}\n\n${BRING}`;
  }
  return { subject, html: layout(title, body), text };
}

export async function emailParent(kind, ev, b, links, ns) {
  const to = ns === 'test' && !/@resend\.dev$/i.test(b.parent.email) && !businessInbox().includes(b.parent.email) ? TEST_SINK : b.parent.email;
  const msg = parentEmail(kind, ev, b, links);
  return sendSafe({ to, ...msg, idempotencyKey: `${ns}-${b.ref}-${kind}-${b.updatedAt}` });
}

const isBusiness = (b) => Boolean(b && businessInbox().includes(b.parent.email));

// In the test area, admin alerts only really arrive when a test booking uses the business inbox.
export async function emailAdmin({ ns, ev, subject, intro, booking, extraRows = [], adminLink, idem, involves = [] }) {
  const to = ns !== 'test' || [booking, ...involves].some(isBusiness) ? businessInbox() : [TEST_SINK];
  const rows = [...extraRows, ...(booking ? [{ heading: 'Booking' }, { label: 'Reference', value: booking.ref }, { label: 'Status', value: booking.status.replace('_', ' ') }, ...detailRows(booking)] : [])];
  const html = layout(subject.replace(/^\[TEST\] /, ''), para(intro) + (adminLink ? button(adminLink, 'View all bookings', '#18306C', '#ffffff') : '') + rowsHtml(rows));
  return sendSafe({
    to,
    replyTo: booking ? booking.parent.email : undefined,
    subject: (ns === 'test' ? '[TEST] ' : '') + subject,
    html,
    text: `${intro}\n${adminLink ? `View all bookings: ${adminLink}\n` : ''}${rowsText(rows)}`,
    idempotencyKey: idem ? `${ns}-${idem}` : undefined,
  });
}

export const placesLine = (c) => `${c.confirmed} of ${c.cap} places taken${c.waitlist ? `, ${c.waitlist} child${c.waitlist === 1 ? '' : 'ren'} on the waiting list` : ''}`;

/* ---------- Cancelling (parent link or admin page) ---------- */

export async function cancelBooking({ ns, ev, ref, token, by, base, now = Date.now() }) {
  const r = await mutate(keyFor(ns, ev), (state) => {
    const b = state.bookings.find((x) => x.ref === ref);
    if (!b || (by !== 'admin' && !tokenMatches(token, b.cancelToken))) {
      throw new HttpError(404, 'We couldn’t find that booking. Please check the link in your email.');
    }
    if (b.status === 'cancelled') return { already: true, booking: b };
    const at = new Date(now).toISOString();
    b.cancelledFrom = b.status;
    b.status = 'cancelled';
    b.updatedAt = at;
    b.history.push([at, by === 'admin' ? 'Cancelled by PlayOn Active' : 'Cancelled by the parent (email link)']);
    const promoted = ev.waitlist && capFor(ev) ? promote(state, ev, now) : [];
    return { booking: b, promoted, counts: counts(state, ev) };
  });
  if (r.already) return { already: true, booking: r.booking };

  const b = r.booking;
  const book = `${base}/taster`;
  const sends = [emailParent('cancelled', ev, b, { book }, ns)];
  for (const p of r.promoted) sends.push(emailParent('promoted', ev, p, { cancel: cancelUrl(base, ns, p), book }, ns));
  const passed = r.promoted.map((p) => `${childNames(p)} (${p.ref})`).join(', ');
  const what = b.cancelledFrom === 'waitlist' ? 'WAITING LIST LEAVER' : 'CANCELLATION';
  sends.push(emailAdmin({
    ns, ev,
    subject: `${ev.name} ${what}: ${childNames(b)} – ${b.ref}`,
    intro: `${b.parent.name} ${b.cancelledFrom === 'waitlist' ? 'left the waiting list' : 'cancelled'}${by === 'admin' ? ' (cancelled from the admin page)' : ''}. ` +
      (r.promoted.length
        ? `The free place${r.promoted.length > 1 ? 's were' : ' was'} given automatically to ${passed}, who ${r.promoted.length > 1 ? 'have' : 'has'} been emailed. `
        : '') +
      (ev.waitlist ? `Now ${placesLine(r.counts)}.` : b.cancelledFrom === 'paid' ? 'This booking was marked as paid: refund the parent in Stripe if needed.' : ''),
    booking: b,
    extraRows: r.promoted.map((p) => ({ label: 'Place given to', value: `${childNames(p)} – ${p.parent.name}, ${p.parent.email}, ${p.parent.mobile} (${p.ref})` })),
    adminLink: adminUrl(base, ns),
    idem: `${b.ref}-admin-cancel`,
    involves: r.promoted,
  }));
  const [parentSent] = await Promise.all(sends);
  return { booking: b, promoted: r.promoted, parentSent };
}
