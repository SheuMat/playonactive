// Offline tests for the booking API: node _build/test-api.mjs
// Uses an in-memory store and a fake Resend, so nothing real is booked or sent.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.RESEND_API_KEY = 're_test_key';
process.env.EMAIL_TO = 'owner@playonactive.co.uk';
process.env.EMAIL_FROM = 'PlayOn Active <hello@playonactive.co.uk>';
process.env.SITE_URL = 'https://www.playonactive.co.uk';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
globalThis.__poaMemStore = new Map();

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    sent.push(JSON.parse(opts.body));
    return new Response(JSON.stringify({ id: 'em_' + sent.length }), { status: 200 });
  }
  return realFetch(url, opts);
};

const signup = await import('../api/signup.js');
const cancel = await import('../api/cancel.js');
const admin = await import('../api/admin.js');
const webhook = await import('../api/stripe-webhook.js');
const B = await import('../api/_lib/bookings.js');

const site = 'https://www.playonactive.co.uk';
const post = (handler, path, body, headers = {}) =>
  handler.POST(new Request(site + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const get = (handler, path, headers = {}) => handler.GET(new Request(site + path, { headers }));
const out = async (res) => ({ status: res.status, body: await res.json() });

let n = 0;
const form = (event, kids = 1, over = {}) => {
  n++;
  return {
    event,
    parent: { name: `Parent ${n}`, email: `parent${n}@example.com`, mobile: '07700 900' + String(n).padStart(3, '0') },
    children: Array.from({ length: kids }, (_, i) => ({ name: `Child ${n}${'ab'[i]} Smith`, year: 'Year 2', school: 'Southbury Primary', allergies: i ? '' : 'Peanuts' })),
    emergency: { name: 'Gran Smith', phone: '07700 900999' },
    collectors: 'Parent and Gran',
    consents: { photo: 'No', firstAid: true, terms: true, marketing: false },
    ...over,
  };
};
const book = async (event, kids, over) => out(await post(signup, '/api/signup', form(event, kids, over)));
const reset = () => { globalThis.__poaMemStore.clear(); sent.length = 0; };
const live = (ev) => JSON.parse(globalThis.__poaMemStore.get(`poa:live:${ev}`) || '{"bookings":[]}');
const tokenOf = (ref) => live('taster').bookings.find((b) => b.ref === ref).cancelToken;
const confirmedKids = () => live('taster').bookings.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.children.length, 0);
const mailTo = (addr) => sent.filter((m) => m.to.includes(addr));

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log('  ✓', name); } catch (err) { console.error('  ✗', name); throw err; }
};

console.log('Taster Day');

await test('status is open and never reveals numbers', async () => {
  reset();
  const r = await out(await get(signup, '/api/signup'));
  assert.equal(r.body.ready, true);
  assert.deepEqual(r.body.events, { taster: { status: 'open' }, playday: { status: 'open' } });
});

let refs = [];
await test('20 children are confirmed (18 single bookings + one family of 2)', async () => {
  reset();
  refs = [];
  for (let i = 0; i < 18; i++) {
    const r = await book('taster', 1);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'confirmed');
    refs.push(r.body.ref);
  }
  const fam = await book('taster', 2);
  assert.equal(fam.body.status, 'confirmed');
  refs.push(fam.body.ref);
  assert.equal(confirmedKids(), 20);
  // each booking: parent confirmation + admin alert
  assert.equal(sent.length, 38);
  const conf = mailTo(`parent1@example.com`)[0];
  assert.match(conf.subject, /Free Taster Day place is confirmed/);
  assert.match(conf.html, /\/cancel\?ref=TD-[A-Z0-9]{6}&amp;t=/);
  assert.match(conf.html, /packed lunch/);
  assert.match(conf.html, /£5/);
  assert.equal(conf.reply_to, 'hello@playonactive.co.uk');
  const alert = mailTo('owner@playonactive.co.uk').at(-1);
  assert.match(alert.subject, /20\/20 places taken/);
  assert.match(alert.html, /Peanuts/);
  assert.match(alert.html, /\/admin\?key=/);
});

await test('public status switches to the waiting list when full', async () => {
  const r = await out(await get(signup, '/api/signup'));
  assert.equal(r.body.events.taster.status, 'waitlist');
  assert.ok(!JSON.stringify(r.body).match(/\d{2}/), 'no numbers in the public status');
});

let wA, wB, wC;
await test('more bookings join the waiting list in order (never over 20)', async () => {
  sent.length = 0;
  wA = (await book('taster', 1)).body;
  wB = (await book('taster', 2)).body;
  wC = (await book('taster', 1)).body;
  assert.deepEqual([wA.status, wB.status, wC.status], ['waitlist', 'waitlist', 'waitlist']);
  assert.equal(confirmedKids(), 20);
  const wl = mailTo(wA.email)[0];
  assert.match(wl.subject, /waiting list/);
  assert.match(wl.html, /Leave the waiting list/);
  assert.ok(mailTo('owner@playonactive.co.uk').every((m) => /WAITING LIST/.test(m.subject)));
});

await test('cancel link: wrong token is refused', async () => {
  const r = await out(await post(cancel, '/api/cancel', { ref: refs[0], t: 'nope' }));
  assert.equal(r.status, 404);
  const g = await out(await get(cancel, `/api/cancel?ref=${refs[0]}&t=wrong`));
  assert.equal(g.status, 404);
});

await test('opening the cancel link only shows the booking (does not cancel)', async () => {
  const g = await out(await get(cancel, `/api/cancel?ref=${refs[0]}&t=${tokenOf(refs[0])}`));
  assert.equal(g.status, 200);
  assert.equal(g.body.status, 'confirmed');
  assert.equal(confirmedKids(), 20);
});

await test('cancelling gives the place to the first family on the waiting list + "You’ve got a place!"', async () => {
  sent.length = 0;
  const r = await out(await post(cancel, '/api/cancel', { ref: refs[0], t: tokenOf(refs[0]) }));
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'cancelled');
  const s = live('taster');
  assert.equal(s.bookings.find((b) => b.ref === wA.ref).status, 'confirmed');
  assert.equal(confirmedKids(), 20);
  const got = mailTo(wA.email);
  assert.equal(got.length, 1);
  assert.match(got[0].subject, /You’ve got a place!/);
  assert.match(got[0].html, /\/cancel\?ref=/);
  assert.match(mailTo('parent1@example.com')[0].subject, /cancelled/);
  const alert = mailTo('owner@playonactive.co.uk')[0];
  assert.match(alert.subject, /CANCELLATION/);
  assert.match(alert.html, new RegExp(wA.ref));
});

await test('cancelling twice is harmless', async () => {
  sent.length = 0;
  const r = await out(await post(cancel, '/api/cancel', { ref: refs[0], t: tokenOf(refs[0]) }));
  assert.equal(r.body.already, true);
  assert.equal(sent.length, 0);
});

await test('one free place skips a family of 2 (they keep their spot) and goes to the next who fits', async () => {
  await post(cancel, '/api/cancel', { ref: refs[1], t: tokenOf(refs[1]) });
  const s = live('taster');
  assert.equal(s.bookings.find((b) => b.ref === wB.ref).status, 'waitlist');
  assert.equal(s.bookings.find((b) => b.ref === wC.ref).status, 'confirmed');
  assert.equal(confirmedKids(), 20);
  await post(cancel, '/api/cancel', { ref: refs[2], t: tokenOf(refs[2]) });
  assert.equal(confirmedKids(), 19);
  assert.equal(live('taster').bookings.find((b) => b.ref === wB.ref).status, 'waitlist');
  const r = await out(await get(signup, '/api/signup'));
  assert.equal(r.body.events.taster.status, 'open');
  await post(cancel, '/api/cancel', { ref: refs[3], t: tokenOf(refs[3]) });
  assert.equal(live('taster').bookings.find((b) => b.ref === wB.ref).status, 'confirmed');
  assert.equal(confirmedKids(), 20);
});

await test('leaving the waiting list does not give anyone a place', async () => {
  const w = (await book('taster', 1)).body;
  assert.equal(w.status, 'waitlist');
  sent.length = 0;
  await post(cancel, '/api/cancel', { ref: w.ref, t: tokenOf(w.ref) });
  assert.equal(confirmedKids(), 20);
  assert.match(mailTo(w.email)[0].subject, /left the Free Taster Day waiting list/);
  assert.match(mailTo('owner@playonactive.co.uk')[0].subject, /WAITING LIST LEAVER/);
});

await test('40 people booking at the same moment can never take more than 20 places', async () => {
  reset();
  const results = await Promise.all(Array.from({ length: 40 }, () => post(signup, '/api/signup', form('taster', 1)).then(out)));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.find((r) => r.status !== 200)));
  assert.equal(confirmedKids(), 20);
  assert.equal(results.filter((r) => r.body.status === 'confirmed').length, 20);
  assert.equal(results.filter((r) => r.body.status === 'waitlist').length, 20);
});

await test('the same child cannot be booked twice', async () => {
  reset();
  const f = form('taster', 1);
  assert.equal((await out(await post(signup, '/api/signup', f))).status, 200);
  const again = await out(await post(signup, '/api/signup', f));
  assert.equal(again.status, 409);
});

await test('required fields and consents are checked on the server', async () => {
  const r = await book('taster', 1, { consents: { photo: '', firstAid: false, terms: false } });
  assert.equal(r.status, 422);
  assert.ok(r.body.details.some((d) => /photo/i.test(d)));
  assert.ok(r.body.details.some((d) => /first aid/i.test(d)));
  assert.ok(r.body.details.some((d) => /terms/i.test(d)));
  const y = await book('taster', 1, { children: [{ name: 'Sam Lee', year: 'Year 6', school: 'X School' }] });
  assert.equal(y.status, 422);
  const three = await book('taster', 1, { children: [1, 2, 3].map((i) => ({ name: `Kid ${i} Lee`, year: 'Year 1', school: 'X School' })) });
  assert.equal(three.status, 422);
});

await test('bookings close when the day starts', async () => {
  const realNow = Date.now;
  Date.now = () => Date.parse('2026-11-28T10:00:01Z');
  try {
    const r = await book('taster', 1);
    assert.equal(r.status, 409);
    const s = await out(await get(signup, '/api/signup'));
    assert.equal(s.body.events.taster.status, 'closed');
  } finally { Date.now = realNow; }
});

console.log('Play Day');

await test('booking 2 children: saved as awaiting payment, one £10 Stripe payment per child, email sent', async () => {
  reset();
  const r = await book('playday', 2);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'awaiting_payment');
  assert.match(r.body.ref, /^PD-/);
  assert.equal(r.body.payments.length, 2);
  r.body.payments.forEach((p, i) => {
    assert.equal(p.amount, 1000);
    assert.ok(p.url.startsWith('https://buy.stripe.com/5kQbJ0bcpb9q6wCfT43wQ06?prefilled_email='));
    assert.ok(p.url.endsWith(`client_reference_id=${r.body.ref}-${i + 1}`));
  });
  const one = await book('playday', 1);
  assert.ok(one.body.payments[0].url.endsWith(`client_reference_id=${one.body.ref}`));
  const mail = mailTo(r.body.email)[0];
  assert.match(mail.subject, /Play Day booking/);
  assert.match(mail.html, /buy\.stripe\.com/);
  assert.match(mailTo('owner@playonactive.co.uk')[0].subject, /awaiting £20/);
  assert.ok(!JSON.stringify(sent).includes('£5 link'), 'no £5 link anywhere');
});

await test('Play Day has no cap by default, but PLAYDAY_CAP enforces one', async () => {
  reset();
  for (let i = 0; i < 25; i++) assert.equal((await book('playday', 1)).status, 200);
  process.env.PLAYDAY_CAP = '26';
  try {
    assert.equal((await book('playday', 2)).status, 409);
    assert.equal((await book('playday', 1)).status, 200);
    assert.equal((await book('playday', 1)).status, 409);
    const s = await out(await get(signup, '/api/signup'));
    assert.equal(s.body.events.playday.status, 'full');
  } finally { delete process.env.PLAYDAY_CAP; }
});

await test('Stripe webhook marks a Play Day booking paid once every child is paid', async () => {
  reset();
  const r = (await book('playday', 2)).body;
  const hook = async (crId, id) => {
    const payload = JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { client_reference_id: crId, payment_status: 'paid', amount_total: 1000, payment_intent: 'pi_' + id } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'whsec_test').update(`${t}.${payload}`).digest('hex');
    return webhook.POST(new Request(site + '/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload }));
  };
  assert.equal((await hook(`${r.ref}-1`, 'evt_1')).status, 200);
  assert.equal(live('playday').bookings[0].status, 'awaiting_payment');
  await hook(`${r.ref}-2`, 'evt_2');
  assert.equal(live('playday').bookings[0].status, 'paid');
  const bad = await webhook.POST(new Request(site + '/api/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: '{}' }));
  assert.equal(bad.status, 400);
});

console.log('Admin');

await test('admin data needs a valid sign-in key', async () => {
  reset();
  await book('taster', 2);
  await book('playday', 1);
  assert.equal((await get(admin, '/api/admin')).status, 401);
  assert.equal((await get(admin, '/api/admin?key=123.abc')).status, 401);
  const r = await out(await get(admin, '/api/admin', { authorization: `Bearer ${B.adminToken()}` }));
  assert.equal(r.status, 200);
  assert.equal(r.body.events.taster.counts.confirmed, 2);
  assert.equal(r.body.events.playday.bookings.length, 1);
  assert.ok(!JSON.stringify(r.body).includes('cancelToken'));
  const expired = B.adminToken(Date.now() - 15 * 86400000);
  assert.equal((await get(admin, `/api/admin?key=${expired}`)).status, 401);
});

await test('CSV export has one row per child with all details', async () => {
  const res = await get(admin, `/api/admin?event=taster&csv=1&key=${B.adminToken()}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /Reference,Status,Waiting list position/);
  assert.match(lines[1], /Peanuts/);
});

await test('admin can cancel (place passes on) and mark Play Day as paid', async () => {
  reset();
  const key = B.adminToken();
  const auth = { authorization: `Bearer ${key}` };
  for (let i = 0; i < 20; i++) await book('taster', 1);
  const w = (await book('taster', 1)).body;
  const first = live('taster').bookings[0].ref;
  const r = await out(await post(admin, '/api/admin', { action: 'cancel', ref: first }, auth));
  assert.deepEqual(r.body.promoted, [w.ref]);
  assert.equal((await post(admin, '/api/admin', { action: 'cancel', ref: first })).status, 401);
  const pd = (await book('playday', 1)).body;
  await post(admin, '/api/admin', { action: 'paid', ref: pd.ref }, auth);
  assert.equal(live('playday').bookings[0].status, 'paid');
});

await test('sign-in link is only emailed to the business inbox, at most once a minute', async () => {
  reset();
  await post(admin, '/api/admin', { action: 'link' });
  await post(admin, '/api/admin', { action: 'link' });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@playonactive.co.uk']);
  const key = /admin\?key=([^"&]+)/.exec(sent[0].html)[1];
  assert.ok(B.adminTokenValid(key));
});

console.log('Test area');

await test('test bookings are kept apart from real ones and can only email test/business inboxes', async () => {
  reset();
  const r = await out(await post(signup, '/api/signup', { ...form('taster', 1), test: true }));
  assert.equal(r.status, 422);
  const ok = await out(await post(signup, '/api/signup', { ...form('taster', 1, { parent: { name: 'Test Parent', email: 'delivered+1@resend.dev', mobile: '07700900111' } }), test: true }));
  assert.equal(ok.status, 200);
  assert.equal(live('taster').bookings.length, 0);
  assert.ok(sent.every((m) => m.to.every((t) => /@resend\.dev$/.test(t))));
  assert.match(sent.find((m) => /TEST/.test(m.subject)).subject, /^\[TEST\]/);
  const view = await out(await get(admin, '/api/admin?test=1'));
  assert.equal(view.body.events.taster.bookings.length, 1);
  await post(admin, '/api/admin', { action: 'reset', test: true });
  assert.equal((await out(await get(admin, '/api/admin?test=1'))).body.events.taster.bookings.length, 0);
  const realNow = Date.now;
  Date.now = () => B.TEST_UNTIL + 1;
  try {
    assert.equal((await post(signup, '/api/signup', { ...form('taster', 1), test: true })).status, 403);
  } finally { Date.now = realNow; }
});

console.log(`\n${passed} tests passed`);
