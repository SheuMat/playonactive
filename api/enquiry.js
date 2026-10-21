// /api/enquiry
// GET  -> whether email is set up (the site falls back to a mailto link if not)
// POST -> sends a general enquiry or a holiday camp "register interest" to PlayOn Active
import { handle, json, readJson, str, isEmail, isPhone, HttpError } from './_lib/http.js';
import { emailReady, sendEmail, businessInbox, layout, para, rowsHtml, rowsText } from './_lib/email.js';

const PROGRAMMES = ['Saturday Club', 'After-School Clubs', 'Holiday Camps', 'Something else'];
const HOLIDAYS = ['February half-term', 'Easter holidays', 'May half-term', 'Summer holidays'];

export const GET = handle(async () => json({ ready: emailReady() }));

export const POST = handle(async (request) => {
  const b = await readJson(request, 20000);
  // Spam traps: hidden field filled in, or form sent impossibly fast.
  if (str(b.website) || (Number(b.elapsed) > 0 && Number(b.elapsed) < 2500)) return json({ ok: true });
  if (!emailReady()) throw new HttpError(503, 'Our online form isn’t connected yet.');

  const name = str(b.name, 120);
  const email = str(b.email, 254);
  const errors = [];
  if (name.length < 2) errors.push('Enter your name.');
  if (!isEmail(email)) errors.push('Enter a valid email address.');

  let subject;
  let title;
  let rows;
  if (b.kind === 'camp-interest') {
    const holidays = Array.isArray(b.holidays) ? b.holidays.filter((h) => HOLIDAYS.includes(h)) : [];
    const phone = str(b.phone, 30);
    if (!holidays.length) errors.push('Choose at least one holiday.');
    if (phone && !isPhone(phone)) errors.push('Enter a valid phone number.');
    if (b.consent !== true) errors.push('Please agree to be contacted about holiday camps.');
    if (errors.length) throw new HttpError(422, 'Please check the form.', errors);
    subject = `Holiday camp interest – ${name}`;
    title = 'New holiday camp interest';
    rows = [
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Phone', value: phone },
      { label: 'Holidays', value: holidays.join(', ') },
      { label: 'Children (ages / school years)', value: str(b.children, 500) },
      { label: 'Message', value: str(b.message, 2000) },
    ];
  } else {
    const programme = PROGRAMMES.includes(b.programme) ? b.programme : '';
    const message = str(b.message, 3000);
    if (!programme) errors.push('Choose a programme.');
    if (message.length < 2) errors.push('Enter your message.');
    if (errors.length) throw new HttpError(422, 'Please check the form.', errors);
    subject = `Website enquiry (${programme}) – ${name}`;
    title = 'New website enquiry';
    rows = [
      { label: 'Name', value: name },
      { label: 'Email', value: email },
      { label: 'Programme', value: programme },
      { label: 'Message', value: message },
    ];
  }

  await sendEmail({
    to: businessInbox(),
    replyTo: email,
    subject,
    html: layout(title, para('Reply to this email to respond directly.') + rowsHtml(rows)),
    text: rowsText(rows),
  });
  return json({ ok: true });
});
