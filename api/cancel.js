// /api/cancel
// GET  ?ref=TD-XXXXXX&t=TOKEN -> a short summary so the cancel page can ask "are you sure?"
// POST { ref, t }              -> cancels; on the taster, the next family on the waiting list
//                                 who fits is given the place and emailed automatically.
// Cancelling needs a click on the page (not just opening the link), so email
// link-scanners can't cancel bookings by accident.
import { handle, json, readJson, siteUrl, str, HttpError } from './_lib/http.js';
import { eventForRef } from './_lib/events.js';
import { load } from './_lib/store.js';
import { firstName } from './_lib/signup.js';
import * as B from './_lib/bookings.js';

const notFound = () => new HttpError(404, 'We couldn’t find that booking. Please check the link in your email.');

const summary = (ev, b) => ({
  ref: b.ref,
  event: ev.key,
  eventName: ev.name,
  dateLabel: ev.dateLabel,
  status: b.status,
  cancelledFrom: b.cancelledFrom || null,
  parent: firstName(b.parent.name),
  children: b.children.map((c) => firstName(c.name)),
});

export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const ref = str(q.get('ref'), 20);
  const ev = eventForRef(ref);
  if (!ev) throw notFound();
  const ns = B.namespace(q.get('test') === '1');
  const b = (await load(B.keyFor(ns, ev))).bookings.find((x) => x.ref === ref);
  if (!b || !B.tokenMatches(q.get('t'), b.cancelToken)) throw notFound();
  return json(summary(ev, b));
});

export const POST = handle(async (request) => {
  const body = await readJson(request, 2000);
  const ref = str(body.ref, 20);
  const ev = eventForRef(ref);
  if (!ev) throw notFound();
  const ns = B.namespace(body.test === true);
  const r = await B.cancelBooking({ ns, ev, ref, token: str(body.t, 100), by: 'parent', base: siteUrl(request) });
  return json({ ...summary(ev, r.booking), already: Boolean(r.already) });
});
