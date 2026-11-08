// /api/admin – the bookings page at /admin.
//
// Sign-in is by emailed link: anyone can ask for a link, but it is only ever sent
// to the business inbox (EMAIL_TO). Links last 14 days, and every admin alert
// email includes a fresh one.
//
// GET  ?key=...                       -> both days, with every booking and the waiting list
// GET  ?key=...&event=taster&csv=1    -> CSV download (one row per child)
// POST { action: 'link' }             -> email a sign-in link to the business inbox
// POST { action: 'cancel', ref }      -> cancel a booking (passes the place on, like a parent cancelling)
// POST { action: 'paid', ref, paid }  -> mark a Play Day booking as paid / not paid
// POST { action: 'reset', test: true }-> clear the test area (test bookings only)
import { handle, json, readJson, siteUrl, str, escapeHtml, HttpError } from './_lib/http.js';
import { EVENTS, eventFor, eventForRef } from './_lib/events.js';
import { load, mutate, setOnce, del } from './_lib/store.js';
import { emailReady, sendEmail, businessInbox, layout, para } from './_lib/email.js';
import * as B from './_lib/bookings.js';

function auth(request, body = {}) {
  const url = new URL(request.url);
  const header = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = header || body.key || url.searchParams.get('key') || '';
  const ns = B.namespace(body.test === true || url.searchParams.get('test') === '1');
  // The test area only ever holds made-up bookings, so it is viewable without a key while it exists.
  if (ns !== 'test' && !B.adminTokenValid(key)) throw new HttpError(401, 'Please sign in again.');
  return ns;
}

function dayView(ev, state) {
  let pos = 0;
  return {
    key: ev.key,
    name: ev.name,
    dateLabel: ev.dateLabel,
    price: ev.price,
    waitlistEnabled: ev.waitlist,
    counts: B.counts(state, ev),
    bookings: state.bookings.map((b) => ({ ...B.publicCopy(b), position: b.status === 'waitlist' ? ++pos : null })),
  };
}

const CSV_SAFE = (v) => {
  let s = String(v ?? '');
  if (/^[=@\t\r]/.test(s) || /^[+-][^\d\s]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(view) {
  const head = ['Reference', 'Status', 'Waiting list position', 'Booked at', 'Child name', 'School year', 'School',
    'Medical conditions', 'Allergies', 'Medication', 'Additional needs / other', 'Children in booking',
    'Parent/carer', 'Email', 'Mobile', 'Emergency contact', 'Emergency number', 'Adults who may collect',
    'Photo consent', 'First aid & emergency treatment', 'Terms & privacy agreed', 'Future updates'];
  const rows = [head];
  for (const b of view.bookings) {
    for (const c of b.children) {
      rows.push([b.ref, b.status.replace('_', ' '), b.position ?? '', b.createdAt.replace('T', ' ').slice(0, 16),
        c.name, c.year, c.school, c.medical, c.allergies, c.medication, c.needs, b.children.length,
        b.parent.name, b.parent.email, b.parent.mobile, b.emergency.name, b.emergency.phone, b.collectors,
        b.consents.photo, b.consents.firstAid ? 'Yes' : 'No', b.consents.terms ? 'Yes' : 'No', b.consents.marketing ? 'Yes' : 'No']);
    }
  }
  return '﻿' + rows.map((r) => r.map(CSV_SAFE).join(',')).join('\r\n') + '\r\n';
}

export const GET = handle(async (request) => {
  const ns = auth(request);
  const q = new URL(request.url).searchParams;
  if (q.get('csv') === '1') {
    const ev = eventFor(q.get('event'));
    if (!ev) throw new HttpError(400, 'Choose a day.');
    const csv = toCsv(dayView(ev, await load(B.keyFor(ns, ev))));
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="playon-${ev.key}-${ns === 'test' ? 'TEST-' : ''}${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const events = {};
  for (const ev of Object.values(EVENTS)) events[ev.key] = dayView(ev, await load(B.keyFor(ns, ev)));
  return json({ ns, generatedAt: new Date().toISOString(), events });
});

export const POST = handle(async (request) => {
  const body = await readJson(request, 2000);
  const base = siteUrl(request);

  if (body.action === 'link') {
    if (!emailReady()) throw new HttpError(503, 'Email isn’t set up yet.');
    // At most one link a minute, so the form can't be used to flood the inbox.
    if (await setOnce('poa:admin-link', 60)) {
      const link = B.adminUrl(base, 'live');
      await sendEmail({
        to: businessInbox(),
        subject: 'Your PlayOn Active bookings link',
        html: layout('View your bookings', para('Use this button to open the bookings page. The link works for 14 days. Don’t forward it: anyone with the link can see the bookings.') +
          `<p style="margin:22px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#18306C;color:#fff;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:999px">Open bookings</a></p>` +
          para('If you didn’t ask for this, you can ignore this email.')),
        text: `Open your bookings (link works for 14 days, don't forward it): ${link}`,
      });
    }
    return json({ ok: true });
  }

  const ns = auth(request, body);

  if (body.action === 'cancel') {
    const ref = str(body.ref, 20);
    const ev = eventForRef(ref);
    if (!ev) throw new HttpError(404, 'Booking not found.');
    const r = await B.cancelBooking({ ns, ev, ref, by: 'admin', base });
    return json({ ok: true, already: Boolean(r.already), promoted: (r.promoted || []).map((p) => p.ref) });
  }

  if (body.action === 'paid') {
    const ref = str(body.ref, 20);
    const ev = eventForRef(ref);
    if (!ev || !ev.price) throw new HttpError(404, 'Booking not found.');
    await mutate(B.keyFor(ns, ev), (state) => {
      const b = state.bookings.find((x) => x.ref === ref);
      if (!b) throw new HttpError(404, 'Booking not found.');
      if (b.status === 'cancelled') throw new HttpError(409, 'That booking is cancelled.');
      const at = new Date().toISOString();
      b.status = body.paid === false ? 'awaiting_payment' : 'paid';
      b.updatedAt = at;
      b.history.push([at, b.status === 'paid' ? 'Marked as paid' : 'Marked as not paid']);
    });
    return json({ ok: true });
  }

  if (body.action === 'reset') {
    if (ns !== 'test') throw new HttpError(403, 'Only test bookings can be cleared.');
    for (const ev of Object.values(EVENTS)) await del(B.keyFor(ns, ev));
    return json({ ok: true });
  }

  throw new HttpError(400, 'Unknown action.');
});
