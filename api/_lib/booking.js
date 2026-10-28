// Validates a Saturday Club booking and works out the price on the server,
// so the amount charged never depends on what the browser sends.
import { HttpError, str, isEmail, isPhone, isPostcode } from './http.js';
import { CLUB, isOpen, price, fmtDate, fmtMoney } from './saturday.js';

const SEND = ['No', 'Yes', 'Prefer to discuss'];
const PHOTO = ['Yes – website and social media', 'Yes – internal use only', 'No photos'];
const RELATIONSHIPS = ['Mum', 'Dad', 'Step-parent', 'Guardian', 'Grandparent', 'Other family member', 'Foster carer', 'Other'];

export function validateBooking(input, now = Date.now()) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };

  // Sessions
  let option = b.option === 'block' ? 'block' : b.option === 'single' ? 'single' : null;
  need(option, 'Choose all four Saturdays or individual Saturdays.');
  let dates = Array.isArray(b.dates) ? [...new Set(b.dates.filter((d) => CLUB.dates.includes(d)))].sort() : [];
  if (option === 'block') dates = [...CLUB.dates];
  need(dates.length > 0, 'Choose at least one Saturday.');
  need(dates.every((d) => isOpen(d, now)), 'One or more of the Saturdays you chose can no longer be booked online.');
  if (option === 'single' && dates.length === CLUB.dates.length) option = 'block'; // cheaper for the parent

  // Parent / carer
  const p = b.parent || {};
  const parent = {
    name: str(p.name, 120),
    relationship: str(p.relationship, 40),
    email: str(p.email, 254).toLowerCase(),
    phone: str(p.phone, 30),
    address1: str(p.address1, 150),
    address2: str(p.address2, 150),
    town: str(p.town, 80),
    postcode: str(p.postcode, 10).toUpperCase(),
  };
  need(parent.name.length >= 2, 'Enter your full name.');
  need(RELATIONSHIPS.includes(parent.relationship), 'Choose your relationship to the child.');
  need(isEmail(parent.email), 'Enter a valid email address.');
  need(isPhone(parent.phone), 'Enter a valid phone number.');
  need(parent.address1 && parent.town, 'Enter your address.');
  need(isPostcode(parent.postcode), 'Enter a valid UK postcode.');

  // Children
  const kids = Array.isArray(b.children) ? b.children : [];
  need(kids.length >= 1 && kids.length <= CLUB.maxChildren, `Add between 1 and ${CLUB.maxChildren} children.`);
  const children = kids.slice(0, CLUB.maxChildren).map((c = {}, i) => {
    const n = i + 1;
    const child = {
      first: str(c.first, 60),
      last: str(c.last, 60),
      dob: str(c.dob, 10),
      year: str(c.year, 20),
      school: str(c.school, 120),
      gender: str(c.gender, 30),
      medical: str(c.medical, 1000),
      allergies: str(c.allergies, 500),
      medication: str(c.medication, 500),
      dietary: str(c.dietary, 300),
      send: str(c.send, 30),
      sendDetails: str(c.sendDetails, 1000),
      about: str(c.about, 500),
    };
    need(child.first && child.last, `Enter child ${n}'s first name and surname.`);
    const dob = Date.parse(child.dob);
    const age = (now - dob) / 31557600000;
    need(/^\d{4}-\d{2}-\d{2}$/.test(child.dob) && age >= 4 && age <= 12, `Enter a valid date of birth for child ${n}.`);
    need(CLUB.years.includes(child.year), `Saturday Club is for School Years 1–5. Check child ${n}'s school year.`);
    need(child.school, `Enter the school child ${n} attends.`);
    need(SEND.includes(child.send), `Tell us whether child ${n} has any SEND.`);
    return child;
  });

  // Emergency contact & collection
  const e = b.emergency || {};
  const emergency = {
    name: str(e.name, 120),
    relationship: str(e.relationship, 60),
    phone: str(e.phone, 30),
    altPhone: str(e.altPhone, 30),
    collectors: str(e.collectors, 500),
  };
  need(emergency.name && emergency.relationship, 'Enter an emergency contact and their relationship to the child.');
  need(isPhone(emergency.phone), 'Enter a valid emergency contact phone number.');

  // Permissions
  const c = b.consents || {};
  const consents = {
    photo: str(c.photo, 60),
    firstAid: str(c.firstAid, 5),
    accurate: c.accurate === true,
    terms: c.terms === true,
    privacy: c.privacy === true,
    marketing: c.marketing === true,
  };
  need(PHOTO.includes(consents.photo), 'Choose a photo permission option.');
  need(['Yes', 'No'].includes(consents.firstAid), 'Answer the first aid question.');
  need(consents.accurate && consents.terms && consents.privacy, 'Please tick the required boxes in the permissions step.');

  if (errors.length) throw new HttpError(422, 'Please check your booking details.', errors);

  return {
    option,
    dates,
    parent,
    children,
    emergency,
    consents,
    notes: str(b.notes, 1000),
    total: price(option, dates, children.length),
  };
}

// Rows used for the business email (everything) — see email.rowsHtml / rowsText.
export function bookingRows(booking, ref) {
  const { parent: p, emergency: e, consents: c } = booking;
  const rows = [
    { heading: 'Booking' },
    { label: 'Reference', value: ref },
    { label: 'Option', value: booking.option === 'block' ? 'All four Saturdays' : 'Individual Saturdays' },
    { label: 'Saturdays', value: booking.dates.map(fmtDate).join('\n') },
    { label: 'Children', value: String(booking.children.length) },
    { label: 'Total', value: fmtMoney(booking.total) },
    { heading: 'Parent / carer' },
    { label: 'Name', value: p.name },
    { label: 'Relationship', value: p.relationship },
    { label: 'Email', value: p.email },
    { label: 'Phone', value: p.phone },
    { label: 'Address', value: [p.address1, p.address2, p.town, p.postcode].filter(Boolean).join(', ') },
  ];
  booking.children.forEach((k, i) => {
    rows.push(
      { heading: `Child ${i + 1}: ${k.first} ${k.last}` },
      { label: 'Date of birth', value: k.dob.split('-').reverse().join('/') },
      { label: 'School year', value: k.year },
      { label: 'School', value: k.school },
      { label: 'Gender', value: k.gender },
      { label: 'Medical conditions', value: k.medical || 'None given' },
      { label: 'Allergies', value: k.allergies || 'None given' },
      { label: 'Medication', value: k.medication || 'None given' },
      { label: 'Dietary requirements', value: k.dietary || 'None given' },
      { label: 'SEND', value: k.send },
      { label: 'SEND details', value: k.sendDetails },
      { label: 'About them', value: k.about },
    );
  });
  rows.push(
    { heading: 'Emergency contact & collection' },
    { label: 'Name', value: e.name },
    { label: 'Relationship', value: e.relationship },
    { label: 'Phone', value: e.phone },
    { label: 'Other phone', value: e.altPhone },
    { label: 'Also allowed to collect', value: e.collectors || 'Only the parent/carer above' },
    { heading: 'Permissions' },
    { label: 'Photos', value: c.photo },
    { label: 'First aid', value: c.firstAid },
    { label: 'Marketing updates', value: c.marketing ? 'Yes' : 'No' },
    { label: 'Notes', value: booking.notes },
  );
  return rows;
}
