// Offline tests for the API functions. Stripe and Resend are simulated, so no keys
// or network access are needed.  Run:  node _build/test-api.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  RESEND_API_KEY: 're_dummy',
  EMAIL_FROM: 'PlayOn Active <bookings@example.com>',
  EMAIL_TO: 'owner@example.com',
};
const setEnv = (on) => { for (const k of Object.keys(ENV)) { if (on) process.env[k] = ENV[k]; else delete process.env[k]; } };

// --- fake clock (bookings depend on today's date) ---
const realNow = Date.now;
const setNow = (iso) => { Date.now = () => Date.parse(iso); };

// --- fake fetch ---
let calls = [];
let stripeSession = null;
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  if (String(url).startsWith('https://api.stripe.com/v1/checkout/sessions') && opts.method === 'POST') {
    return new Response(JSON.stringify({ id: 'cs_test_abc1234567', url: 'https://checkout.stripe.com/c/pay/cs_test_abc1234567' }), { status: 200 });
  }
  if (String(url).startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
    return new Response(JSON.stringify(stripeSession), { status: 200 });
  }
  if (String(url) === 'https://api.resend.com/emails') {
    return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
  }
  throw new Error('Unexpected fetch ' + url);
};
const stripeCalls = () => calls.filter((c) => c.url.includes('api.stripe.com'));
const emailCalls = () => calls.filter((c) => c.url.includes('api.resend.com')).map((c) => ({ ...JSON.parse(c.opts.body), key: c.opts.headers['Idempotency-Key'] }));

const req = (path, { method = 'GET', body, headers = {} } = {}) =>
  new Request('https://playonactive.example' + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json', ...headers } : headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const book = await import('../api/book.js');
const webhook = await import('../api/stripe-webhook.js');
const status = await import('../api/booking-status.js');
const enquiry = await import('../api/enquiry.js');

const validBooking = (over = {}) => ({
  option: 'block',
  dates: [],
  parent: { name: 'Test <b>Parent</b>', relationship: 'Mum', email: 'parent@example.com', phone: '07700 900123', address1: '1 Test Street', town: 'Enfield', postcode: 'EN3 4JG' },
  children: [{ first: 'Amara', last: 'Test', dob: '2018-05-04', year: 'Year 3', school: 'Test Primary', send: 'No', allergies: 'Peanuts', medical: 'Asthma' }],
  emergency: { name: 'Gran Test', relationship: 'Grandmother', phone: '07700 900456' },
  consents: { photo: 'Yes – internal use only', firstAid: 'Yes', accurate: true, terms: true, privacy: true },
  ...over,
});

let passed = 0;
const test = async (name, fn) => { calls = []; await fn(); passed++; console.log('  ✓', name); };

console.log('API tests');
setNow('2026-10-21T12:00:00Z');

await test('booking reports not ready without keys', async () => {
  setEnv(false);
  const r = await (await book.GET(req('/api/book'))).json();
  assert.equal(r.ready, false);
  assert.equal(r.sessions.length, 5);
  assert.ok(r.sessions.every((s) => s.open));
  const res = await book.POST(req('/api/book', { method: 'POST', body: validBooking() }));
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
});

setEnv(true);

await test('booking reports ready + test mode with keys', async () => {
  const r = await (await book.GET(req('/api/book'))).json();
  assert.equal(r.ready, true);
  assert.equal(r.testMode, true);
});

await test('invalid booking is rejected with reasons', async () => {
  const res = await book.POST(req('/api/book', { method: 'POST', body: { option: 'single', dates: [] } }));
  assert.equal(res.status, 422);
  const r = await res.json();
  assert.ok(r.details.length >= 5);
  assert.equal(calls.length, 0);
});

await test('child outside Years 1–5 is rejected', async () => {
  const b = validBooking();
  b.children[0].year = 'Year 6';
  const res = await book.POST(req('/api/book', { method: 'POST', body: b }));
  assert.equal(res.status, 422);
});

await test('block booking: £120 per child, Stripe + business email', async () => {
  const b = validBooking();
  b.children.push({ first: 'Leo', last: 'Test', dob: '2020-01-10', year: 'Year 1', school: 'Test Primary', send: 'Yes', sendDetails: 'Needs short instructions' });
  const res = await book.POST(req('/api/book', { method: 'POST', body: b }));
  assert.equal(res.status, 200);
  const r = await res.json();
  assert.match(r.url, /^https:\/\/checkout\.stripe\.com/);
  assert.match(r.ref, /^SC-[A-Z2-9]{6}$/);
  const params = new URLSearchParams(stripeCalls()[0].opts.body);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '12000');
  assert.equal(params.get('line_items[0][quantity]'), '2');
  assert.equal(params.get('line_items[1][quantity]'), null);
  assert.equal(params.get('metadata[type]'), 'saturday_club');
  assert.equal(params.get('metadata[dates]'), '2026-11-07,2026-11-14,2026-11-21,2026-11-28,2026-12-05');
  assert.equal(params.get('customer_email'), 'parent@example.com');
  assert.equal(params.get('success_url'), 'https://playonactive.example/booking-confirmed?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(stripeCalls()[0].opts.headers.Authorization, 'Bearer sk_test_dummy');
  const [mail] = emailCalls();
  assert.deepEqual(mail.to, ['owner@example.com']);
  assert.equal(mail.reply_to, 'parent@example.com');
  assert.match(mail.subject, /awaiting payment/);
  assert.match(mail.text, /Asthma/);
  assert.match(mail.text, /Total: £240/);
  assert.ok(!mail.html.includes('<b>Parent</b>'), 'parent name must be HTML-escaped');
  assert.ok(mail.html.includes('&lt;b&gt;Parent&lt;/b&gt;'));
});

await test('individual Saturdays: £25 × sessions × children', async () => {
  const b = validBooking({ option: 'single', dates: ['2026-11-14', '2026-11-28', 'not-a-date'] });
  const res = await book.POST(req('/api/book', { method: 'POST', body: b }));
  assert.equal(res.status, 200);
  const params = new URLSearchParams(stripeCalls()[0].opts.body);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2500');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '2500');
  assert.equal(params.get('line_items[2][price_data][unit_amount]'), null);
  assert.match(params.get('line_items[0][price_data][product_data][name]'), /14 Nov 2026/);
  assert.match(emailCalls()[0].text, /Total: £50/);
});

await test('all five chosen individually is charged as the cheaper block', async () => {
  const b = validBooking({ option: 'single', dates: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05'] });
  await book.POST(req('/api/book', { method: 'POST', body: b }));
  const params = new URLSearchParams(stripeCalls()[0].opts.body);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '12000');
  assert.equal(params.get('metadata[option]'), 'block');
});

await test('past Saturdays cannot be booked; block closes after first Saturday', async () => {
  setNow('2026-11-10T12:00:00Z');
  const s = await (await book.GET(req('/api/book'))).json();
  assert.deepEqual(s.sessions.map((x) => x.open), [false, true, true, true, true]);
  assert.equal((await book.POST(req('/api/book', { method: 'POST', body: validBooking() }))).status, 422);
  assert.equal((await book.POST(req('/api/book', { method: 'POST', body: validBooking({ option: 'single', dates: ['2026-11-07'] }) }))).status, 422);
  assert.equal((await book.POST(req('/api/book', { method: 'POST', body: validBooking({ option: 'single', dates: ['2026-11-14'] }) }))).status, 200);
  setNow('2026-10-21T12:00:00Z');
});

const signed = (event, secret = ENV.STRIPE_WEBHOOK_SECRET) => {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return req('/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } });
};
const paidEvent = (over = {}) => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_test_abc1234567', payment_status: 'paid', amount_total: 24000, payment_intent: 'pi_123',
    customer_details: { email: 'parent@example.com' },
    metadata: { type: 'saturday_club', booking_ref: 'SC-ABC234', option: 'block', dates: '2026-11-07,2026-11-14', children: 'Amara Test (Year 3); Leo Test (Year 1)', parent_name: 'Test Parent', parent_phone: '07700900123' },
    ...over,
  } },
});

await test('webhook rejects a bad signature', async () => {
  const res = await webhook.POST(signed(paidEvent(), 'whsec_wrong'));
  assert.equal(res.status, 400);
  assert.equal(emailCalls().length, 0);
});

await test('webhook sends parent confirmation + PAID email', async () => {
  const res = await webhook.POST(signed(paidEvent()));
  assert.equal(res.status, 200);
  const mails = emailCalls();
  assert.equal(mails.length, 2);
  assert.deepEqual(mails[0].to, ['parent@example.com']);
  assert.match(mails[0].subject, /confirmed \(SC-ABC234\)/);
  assert.match(mails[0].text, /Southbury Primary School/);
  assert.match(mails[0].text, /£240/);
  assert.equal(mails[0].key, 'evt_1-parent');
  assert.match(mails[1].subject, /^PAID: Saturday Club booking SC-ABC234/);
  assert.equal(mails[1].key, 'evt_1-business');
});

await test('webhook ignores unpaid sessions and other events', async () => {
  await webhook.POST(signed(paidEvent({ payment_status: 'unpaid' })));
  await webhook.POST(signed({ ...paidEvent(), type: 'payment_intent.created' }));
  assert.equal(emailCalls().length, 0);
});

await test('webhook asks Stripe to retry if email is not configured', async () => {
  delete process.env.RESEND_API_KEY;
  const res = await webhook.POST(signed(paidEvent()));
  assert.equal(res.status, 500);
  process.env.RESEND_API_KEY = ENV.RESEND_API_KEY;
});

await test('booking status returns a safe summary', async () => {
  assert.equal((await status.GET(req('/api/booking-status?session_id=../../x'))).status, 400);
  stripeSession = paidEvent().data.object;
  const r = await (await status.GET(req('/api/booking-status?session_id=cs_test_abc1234567'))).json();
  assert.equal(r.paid, true);
  assert.equal(r.ref, 'SC-ABC234');
  assert.deepEqual(r.children, ['Amara', 'Leo']);
});

await test('enquiry: honeypot is silently ignored', async () => {
  const res = await enquiry.POST(req('/api/enquiry', { method: 'POST', body: { website: 'spam', name: 'x' } }));
  assert.equal(res.status, 200);
  assert.equal(emailCalls().length, 0);
});

await test('enquiry: general message is emailed with reply-to', async () => {
  const res = await enquiry.POST(req('/api/enquiry', { method: 'POST', body: { kind: 'enquiry', name: 'Jo Bloggs', email: 'jo@example.com', programme: 'Saturday Club', message: 'Is there parking?', elapsed: 9000 } }));
  assert.equal(res.status, 200);
  const [m] = emailCalls();
  assert.equal(m.reply_to, 'jo@example.com');
  assert.match(m.subject, /Saturday Club/);
});

await test('camp interest: validates holidays and consent', async () => {
  const bad = await enquiry.POST(req('/api/enquiry', { method: 'POST', body: { kind: 'camp-interest', name: 'Jo', email: 'jo@example.com', holidays: ['Christmas'], consent: true } }));
  assert.equal(bad.status, 422);
  const ok = await enquiry.POST(req('/api/enquiry', { method: 'POST', body: { kind: 'camp-interest', name: 'Jo', email: 'jo@example.com', holidays: ['February half-term', 'Easter holidays'], consent: true, children: 'Year 2 and Year 4' } }));
  assert.equal(ok.status, 200);
  assert.match(emailCalls()[0].text, /February half-term, Easter holidays/);
});

Date.now = realNow;
console.log(`\n${passed} tests passed`);
