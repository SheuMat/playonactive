// Validates the booking form (shared by the Taster Day and the Play Day).
import { HttpError, str, isEmail, isPhone } from './http.js';
import { YEARS, MAX_CHILDREN } from './events.js';

export function validateSignup(input) {
  const b = input && typeof input === 'object' ? input : {};
  const errors = [];
  const need = (ok, msg) => { if (!ok) errors.push(msg); };

  const p = b.parent || {};
  const parent = {
    name: str(p.name, 120),
    email: str(p.email, 254).toLowerCase(),
    mobile: str(p.mobile, 30),
  };
  need(parent.name.length >= 2, 'Enter your full name.');
  need(isEmail(parent.email), 'Enter a valid email address.');
  need(isPhone(parent.mobile), 'Enter a valid mobile number.');

  const kids = Array.isArray(b.children) ? b.children : [];
  need(kids.length >= 1 && kids.length <= MAX_CHILDREN, `Add ${MAX_CHILDREN === 2 ? 'one or two children' : `up to ${MAX_CHILDREN} children`}.`);
  const children = kids.slice(0, MAX_CHILDREN).map((c = {}, i) => {
    const n = kids.length > 1 ? ` for child ${i + 1}` : '';
    const child = {
      name: str(c.name, 120),
      year: str(c.year, 20),
      school: str(c.school, 120),
      medical: str(c.medical, 1000),
      allergies: str(c.allergies, 500),
      medication: str(c.medication, 500),
      needs: str(c.needs, 1500),
    };
    need(child.name.length >= 2, `Enter the child’s full name${n}.`);
    need(YEARS.includes(child.year), `Choose a school year (Year 1 to Year 5)${n}.`);
    need(child.school.length >= 2, `Enter the child’s school${n}.`);
    return child;
  });
  const names = children.map((c) => c.name.toLowerCase());
  need(new Set(names).size === names.length, 'You’ve entered the same child twice.');

  const e = b.emergency || {};
  const emergency = { name: str(e.name, 120), phone: str(e.phone, 30) };
  need(emergency.name.length >= 2, 'Enter an emergency contact name.');
  need(isPhone(emergency.phone), 'Enter a valid emergency contact number.');

  const collectors = str(b.collectors, 600);
  need(collectors.length >= 2, 'Tell us which adults may collect your child.');

  const c = b.consents || {};
  const consents = {
    photo: c.photo === 'Yes' || c.photo === 'No' ? c.photo : '',
    firstAid: c.firstAid === true,
    terms: c.terms === true,
    marketing: c.marketing === true,
  };
  need(consents.photo, 'Choose Yes or No for photo consent.');
  need(consents.firstAid, 'Please give consent for first aid and emergency treatment.');
  need(consents.terms, 'Please agree to the terms & conditions and privacy notice.');

  if (errors.length) throw new HttpError(422, 'Please check the form.', errors);
  return { parent, children, emergency, collectors, consents };
}

// Same parent booking the same child twice for one day.
export const sameFamily = (a, b) =>
  a.parent.email === b.parent.email &&
  a.children.some((x) => b.children.some((y) => x.name.toLowerCase() === y.name.toLowerCase()));

export const childNames = (booking) => booking.children.map((c) => c.name).join(' & ');
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

// Rows for admin emails and the admin page.
export function detailRows(bk) {
  const rows = [
    { heading: 'Parent / carer' },
    { label: 'Name', value: bk.parent.name },
    { label: 'Email', value: bk.parent.email },
    { label: 'Mobile', value: bk.parent.mobile },
  ];
  bk.children.forEach((k, i) => {
    rows.push(
      { heading: bk.children.length > 1 ? `Child ${i + 1}: ${k.name}` : `Child: ${k.name}` },
      { label: 'School year', value: k.year },
      { label: 'School', value: k.school },
      { label: 'Medical conditions', value: k.medical || 'None given' },
      { label: 'Allergies', value: k.allergies || 'None given' },
      { label: 'Medication', value: k.medication || 'None given' },
      { label: 'Additional needs / other', value: k.needs || 'None given' },
    );
  });
  rows.push(
    { heading: 'Safety' },
    { label: 'Emergency contact', value: `${bk.emergency.name}, ${bk.emergency.phone}` },
    { label: 'Adults who may collect', value: bk.collectors },
    { heading: 'Consents' },
    { label: 'Photo/video consent', value: bk.consents.photo },
    { label: 'First aid & emergency treatment', value: bk.consents.firstAid ? 'Yes' : 'No' },
    { label: 'Terms & privacy agreed', value: bk.consents.terms ? 'Yes' : 'No' },
    { label: 'Future updates', value: bk.consents.marketing ? 'Yes' : 'No' },
  );
  return rows;
}
