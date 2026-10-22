/* Saturday Club booking: step-by-step form, live price summary and hand-off to Stripe Checkout. */
(function () {
  'use strict';

  const form = document.querySelector('[data-booking]');
  if (!form) return;

  // Keep in sync with api/_lib/saturday.js (the server re-checks everything and sets the price).
  const CLUB = {
    sessionPrice: 25,
    blockPrice: 120,
    dates: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05'],
    maxChildren: 4,
    cutoff: (d) => Date.parse(`${d}T09:00:00Z`),
  };
  const API = '/api/book';
  const LOCAL_KEY = 'poa-booking';
  const SESSION_KEY = 'poa-booking-health';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const storage = (area) => ({
    get(k) { try { return JSON.parse(window[area].getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { window[area].setItem(k, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
    del(k) { try { window[area].removeItem(k); } catch (e) { /* unavailable */ } },
  });
  const local = storage('localStorage');
  const session = storage('sessionStorage');

  const steps = $$('[data-step]', form);
  const progress = $('[data-progress]', form);
  const count = $('[data-count]', form);
  const prevBtn = $('[data-prev]', form);
  const nextBtn = $('[data-next]', form);
  const submitBtn = $('[data-submit]', form);
  const payLabel = $('[data-pay-label]', form);
  const errorBox = $('[data-error]', form);
  const kidsWrap = $('[data-kids]', form);
  const healthWrap = $('[data-health]', form);
  const addKidBtn = $('[data-add-kid]', form);
  const datesWrap = $('[data-dates]', form);
  const datesGroup = $('[data-dates-group]', form);
  const blockHint = $('[data-block-hint]', form);
  const kidTpl = $('#kid-tpl');
  const healthTpl = $('#health-tpl');
  let current = 0;
  let errSeq = 0;
  let sessions = CLUB.dates.map((date) => ({ date, open: Date.now() < CLUB.cutoff(date) }));

  const fmt = (d, opts) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', ...opts });
  const shortDate = (d) => fmt(d, { day: 'numeric', month: 'short' });

  /* ---------- Saturdays ---------- */
  const renderDates = () => {
    const picked = new Set($$('input[name="dates"]:checked', form).map((i) => i.value));
    datesWrap.textContent = '';
    sessions.forEach((s) => {
      const label = document.createElement('label');
      label.className = 'date';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'dates';
      input.value = s.date;
      input.disabled = !s.open;
      input.checked = s.open && picked.has(s.date);
      const span = document.createElement('span');
      const dow = document.createElement('small');
      dow.textContent = fmt(s.date, { weekday: 'short' });
      const day = document.createElement('b');
      day.textContent = fmt(s.date, { day: 'numeric' });
      const mon = document.createElement('small');
      mon.textContent = s.open ? fmt(s.date, { month: 'short' }) : 'Closed';
      span.append(dow, day, mon);
      label.append(input, span);
      label.title = s.open ? fmt(s.date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'No longer available to book';
      datesWrap.appendChild(label);
    });
    const block = $('input[name="option"][value="block"]', form);
    const allOpen = sessions.every((s) => s.open);
    block.disabled = !allOpen;
    if (!allOpen) {
      if (block.checked) block.checked = false;
      $('[data-best]', form).textContent = 'No longer available';
    }
  };

  const option = () => ($('input[name="option"]:checked', form) || {}).value || '';
  const chosenDates = () =>
    option() === 'block' ? sessions.map((s) => s.date) : $$('input[name="dates"]:checked', form).map((i) => i.value);

  const pricing = () => {
    let o = option();
    const dates = chosenDates();
    if (o === 'single' && dates.length === CLUB.dates.length) o = 'block';
    const n = kidBlocks().length;
    const total = o === 'block' ? CLUB.blockPrice * n : o === 'single' ? CLUB.sessionPrice * dates.length * n : 0;
    return { option: o, dates, n, total };
  };

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const updateSummary = () => {
    const p = pricing();
    $('[data-sum-option]').textContent = p.option === 'block' ? 'All five Saturdays' : p.option === 'single' ? 'Individual Saturdays' : '—';
    $('[data-sum-dates]').textContent = p.dates.length ? p.dates.map(shortDate).join(', ') : '—';
    $('[data-sum-kids]').textContent = String(p.n);
    $('[data-sum-total]').textContent = '£' + p.total;
    const note = $('[data-sum-note]');
    if (p.option === 'block') {
      note.innerHTML = '';
      note.append(`£120 × ${plural(p.n, 'child').replace('childs', 'children')}`);
      if (option() === 'single') {
        const save = document.createElement('span');
        save.className = 'summary__save';
        save.textContent = ' · block price applied';
        note.append(save);
      }
    } else if (p.option === 'single' && p.dates.length) {
      note.textContent = `£25 × ${plural(p.dates.length, 'Saturday')} × ${plural(p.n, 'child').replace('childs', 'children')}`;
    } else {
      note.textContent = '£25 per Saturday or £120 for all five, per child.';
    }
    payLabel.textContent = p.total ? `Pay £${p.total} securely` : 'Pay securely';
    datesGroup.hidden = option() !== 'single';
    blockHint.hidden = !(option() === 'single' && chosenDates().length === CLUB.dates.length);
  };

  /* ---------- Children & health blocks ---------- */
  const fromTpl = (tpl, n) => {
    const box = document.createElement('div');
    box.innerHTML = tpl.innerHTML.split('__N__').join(String(n));
    return box.firstElementChild;
  };
  const setIndex = (root, n) => {
    $$('[name], [id], [for], [data-if]', root).forEach((el) => {
      ['name', 'id', 'for', 'data-if'].forEach((a) => {
        const v = el.getAttribute(a);
        if (v) el.setAttribute(a, v.replace(/child_\d+_/, `child_${n}_`));
      });
    });
  };
  const kidBlocks = () => $$('[data-kid]', kidsWrap);
  const healthBlocks = () => $$('[data-health-kid]', healthWrap);

  const applyIf = () => {
    $$('[data-if]', form).forEach((el) => {
      const [name, val] = el.dataset.if.split('=');
      const ctl = form.elements[name];
      const on = !!ctl && ctl.value === val;
      el.hidden = !on;
      $$('input, select, textarea', el).forEach((i) => { i.disabled = !on; });
    });
  };

  const refreshKids = () => {
    const kids = kidBlocks();
    kids.forEach((k, i) => {
      setIndex(k, i + 1);
      const title = ($('[data-kid-name]', k).value || '').trim() || `Child ${i + 1}`;
      $('[data-kid-n]', k).textContent = i + 1;
      $('[data-kid-title]', k).textContent = title;
      $('[data-remove-kid]', k).hidden = kids.length === 1;
      const h = healthBlocks()[i];
      if (h) { setIndex(h, i + 1); $('[data-health-title]', h).textContent = title; }
    });
    addKidBtn.hidden = kids.length >= CLUB.maxChildren;
    applyIf();
    updateSummary();
  };
  const syncHealth = () => {
    while (healthBlocks().length < kidBlocks().length) healthWrap.appendChild(fromTpl(healthTpl, healthBlocks().length + 1));
    while (healthBlocks().length > kidBlocks().length) healthBlocks().pop().remove();
    refreshKids();
  };
  const addKid = (focus) => {
    if (kidBlocks().length >= CLUB.maxChildren) return;
    kidsWrap.appendChild(fromTpl(kidTpl, kidBlocks().length + 1));
    syncHealth();
    if (focus) $('input', kidBlocks().pop()).focus();
  };
  addKidBtn.addEventListener('click', () => { addKid(true); saveDraft(); });
  kidsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-kid]');
    if (!btn) return;
    const idx = kidBlocks().indexOf(btn.closest('[data-kid]'));
    kidBlocks()[idx].remove();
    const h = healthBlocks()[idx];
    if (h) h.remove();
    refreshKids();
    saveDraft();
    addKidBtn.focus();
  });
  kidsWrap.addEventListener('input', (e) => { if (e.target.matches('[data-kid-name]')) refreshKids(); });

  /* ---------- Validation ---------- */
  const isLive = (el) => !el.matches(':disabled') && !el.closest('[hidden]:not([data-step])');
  const addErr = (container, msg, input) => {
    const p = document.createElement('p');
    p.className = 'err';
    p.id = 'berr-' + (++errSeq);
    p.textContent = msg;
    container.appendChild(p);
    if (input) input.setAttribute('aria-describedby', p.id);
  };
  const clearErrs = (scope) => {
    $$('.err', scope).forEach((e) => e.remove());
    $$('[aria-invalid]', scope).forEach((e) => e.removeAttribute('aria-invalid'));
  };
  const validate = (scope) => {
    clearErrs(scope);
    let first = null;
    const seen = new Set();
    $$('[data-required-group]', scope).forEach((g) => {
      if (!isLive(g)) return;
      const boxes = $$('input[type="checkbox"]:not(:disabled)', g);
      if (!boxes.some((b) => b.checked)) {
        g.setAttribute('aria-invalid', 'true');
        addErr(g, g.dataset.requiredGroup);
        first = first || boxes[0];
      }
    });
    $$('input, select, textarea', scope).forEach((el) => {
      if (!el.name || !isLive(el)) return;
      if (el.type === 'radio') {
        if (!el.required || seen.has(el.name)) return;
        seen.add(el.name);
        if (!$$(`input[name="${el.name}"]`, form).some((r) => r.checked)) {
          const g = el.closest('.group');
          g.setAttribute('aria-invalid', 'true');
          addErr(g, 'Please choose an option.');
          first = first || el;
        }
        return;
      }
      if (el.type === 'checkbox') {
        if (el.required && !el.checked) {
          el.setAttribute('aria-invalid', 'true');
          addErr(el.closest('.checkline') || el.parentElement, 'Please tick this box to continue.', el);
          first = first || el;
        }
        return;
      }
      const v = el.value.trim();
      let msg = '';
      if (el.required && !v) msg = 'This field is required.';
      else if (v) {
        if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) msg = 'Enter a valid email address, like name@example.com.';
        else if (el.type === 'tel' && v.replace(/\D/g, '').length < 10) msg = 'Enter a valid phone number.';
        else if (el.dataset.type === 'postcode' && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(v)) msg = 'Enter a valid UK postcode.';
        else if (el.dataset.type === 'dob') {
          const age = (Date.now() - Date.parse(v)) / 31557600000;
          if (!(age >= 4 && age <= 12)) msg = 'Enter a valid date of birth (Saturday Club is for ages 6–10).';
        }
      }
      if (msg) {
        el.setAttribute('aria-invalid', 'true');
        addErr(el.closest('.field') || el.parentElement, msg, el);
        first = first || el;
      }
    });
    if (first) {
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !first;
  };
  form.addEventListener('change', (e) => {
    const box = e.target.closest('.field, .group, .checkline');
    if (box && box.querySelector('.err')) clearErrs(box);
  });
  form.addEventListener('input', (e) => {
    const box = e.target.closest('.field');
    if (box && box.querySelector('.err')) clearErrs(box);
  });

  /* ---------- Review ---------- */
  const cleanText = (node) => {
    const c = node.cloneNode(true);
    $$('.req, .opt, .hint, svg', c).forEach((x) => x.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };
  const labelOf = (el) => {
    if (el.dataset.label) return el.dataset.label;
    const group = el.closest('fieldset.group');
    if (group && (el.type === 'radio' || el.type === 'checkbox')) return cleanText($('legend', group));
    const lab = el.id && form.querySelector(`label[for="${el.id}"]`);
    return lab ? cleanText(lab) : el.name;
  };
  const valueOf = (el) => {
    if (el.tagName === 'SELECT') return el.value ? el.options[el.selectedIndex].text : '';
    if (el.type === 'date' && el.value) return el.value.split('-').reverse().join('/');
    return el.value.trim();
  };

  const buildReview = () => {
    const wrap = $('[data-review]', form);
    wrap.textContent = '';
    const p = pricing();
    const sections = [{
      step: 'sessions',
      title: 'Saturdays',
      rows: [
        { label: 'Option', value: p.option === 'block' ? 'All five Saturdays' : 'Individual Saturdays' },
        { label: 'Saturdays', value: p.dates.map((d) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })).join('\n') },
        { label: 'Children', value: String(p.n) },
        { label: 'Total to pay', value: '£' + p.total },
      ],
    }];
    steps.forEach((step) => {
      const key = step.dataset.step;
      if (key === 'sessions' || key === 'review') return;
      const rows = [];
      const seen = new Set();
      let lastBlock = null;
      $$('input, select, textarea', step).forEach((el) => {
        if (!el.name || !isLive(el) || seen.has(el.name)) return;
        const block = el.closest('[data-kid], [data-health-kid], fieldset.sub');
        if (block !== lastBlock && block) {
          const t = $('[data-kid-title], [data-health-title]', block);
          rows.push({ sub: t ? t.textContent : cleanText($('legend', block)) });
        }
        lastBlock = block;
        let value;
        if (el.type === 'radio') {
          seen.add(el.name);
          value = ($(`input[name="${el.name}"]:checked`, form) || {}).value || '';
        } else if (el.type === 'checkbox') {
          value = el.checked ? 'Yes' : '';
        } else {
          value = valueOf(el);
        }
        if (value) rows.push({ label: labelOf(el), value });
      });
      sections.push({ step: key, title: step.dataset.title, rows });
    });

    sections.forEach((sec) => {
      const box = document.createElement('section');
      box.className = 'review__sec';
      const head = document.createElement('div');
      head.className = 'review__head';
      const h = document.createElement('h3');
      h.textContent = sec.title;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => go(steps.findIndex((s) => s.dataset.step === sec.step)));
      head.append(h, edit);
      const dl = document.createElement('dl');
      sec.rows.forEach((r) => {
        if (r.sub) {
          const s = document.createElement('div');
          s.className = 'sub-h';
          s.textContent = r.sub;
          dl.appendChild(s);
          return;
        }
        const dt = document.createElement('dt');
        dt.textContent = r.label;
        const dd = document.createElement('dd');
        dd.textContent = r.value;
        dl.append(dt, dd);
      });
      box.append(head, dl);
      wrap.appendChild(box);
    });
  };

  /* ---------- Navigation ---------- */
  const renderProgress = () => {
    progress.textContent = '';
    steps.forEach((s, i) => {
      const li = document.createElement('li');
      if (i < current) li.className = 'is-done';
      if (i === current) { li.className = 'is-current'; li.setAttribute('aria-current', 'step'); }
      const inner = document.createElement(i < current ? 'button' : 'span');
      if (i < current) {
        inner.type = 'button';
        inner.setAttribute('aria-label', `Go back to ${s.dataset.title}`);
        inner.addEventListener('click', () => go(i));
      } else {
        inner.className = 'lbl';
      }
      const bar = document.createElement('span');
      bar.className = 'bar';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = s.dataset.title;
      inner.append(bar, t);
      li.appendChild(inner);
      progress.appendChild(li);
    });
    count.textContent = `Step ${current + 1} of ${steps.length}`;
  };

  const go = (index, quiet) => {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((s) => { s.hidden = true; });
    const step = steps[current];
    if (step.dataset.step === 'health') syncHealth();
    if (step.dataset.step === 'review') buildReview();
    step.hidden = false;
    const last = current === steps.length - 1;
    prevBtn.hidden = current === 0;
    nextBtn.hidden = last;
    submitBtn.hidden = !last;
    errorBox.hidden = true;
    renderProgress();
    if (!quiet) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const legend = $('legend', step);
      legend.tabIndex = -1;
      legend.focus({ preventScroll: true });
    }
  };
  nextBtn.addEventListener('click', () => { if (validate(steps[current])) go(current + 1); });
  prevBtn.addEventListener('click', () => go(current - 1));
  form.addEventListener('change', () => { applyIf(); updateSummary(); });

  /* ---------- Drafts: general details in localStorage, health details only for this tab ---------- */
  let saveTimer = null;
  let draftsOn = true;
  const snapshot = (sensitive) => {
    const fields = {};
    $$('input, select, textarea', form).forEach((el) => {
      if (!el.name || el.hasAttribute('data-sensitive') !== sensitive) return;
      if (el.type === 'checkbox') {
        if (el.name === 'dates') { fields.dates = fields.dates || []; if (el.checked) fields.dates.push(el.value); }
        else fields[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) fields[el.name] = el.value;
      } else if (el.value) {
        fields[el.name] = el.value;
      }
    });
    return fields;
  };
  const saveDraft = () => {
    if (!draftsOn) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      local.set(LOCAL_KEY, { saved: Date.now(), kids: kidBlocks().length, fields: snapshot(false) });
      session.set(SESSION_KEY, snapshot(true));
    }, 300);
  };
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  const applyValues = (fields) => {
    Object.keys(fields || {}).forEach((name) => {
      const val = fields[name];
      $$(`[name="${name}"]`, form).forEach((el) => {
        if (el.type === 'checkbox') el.checked = name === 'dates' ? Array.isArray(val) && val.includes(el.value) && !el.disabled : val === true;
        else if (el.type === 'radio') el.checked = el.value === val && !el.disabled;
        else el.value = val;
      });
    });
  };
  const restoreDraft = () => {
    const d = local.get(LOCAL_KEY);
    if (!d || !d.fields || Date.now() - d.saved > 14 * 864e5) return false;
    while (kidBlocks().length < Math.min(d.kids || 1, CLUB.maxChildren)) addKid(false);
    syncHealth();
    applyValues(d.fields);
    applyValues(session.get(SESSION_KEY));
    return true;
  };

  /* ---------- Submit -> Stripe ---------- */
  const val = (name) => {
    const el = form.elements[name];
    if (!el) return '';
    if (typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList) return el.value;
    if (el.type === 'checkbox') return el.checked;
    return (el.value || '').trim();
  };
  const payload = () => ({
    option: option(),
    dates: chosenDates(),
    parent: {
      name: val('parent.name'), relationship: val('parent.relationship'), email: val('parent.email'), phone: val('parent.phone'),
      address1: val('parent.address1'), address2: val('parent.address2'), town: val('parent.town'), postcode: val('parent.postcode'),
    },
    children: kidBlocks().map((k, i) => {
      const g = (f) => val(`child_${i + 1}_${f}`);
      return {
        first: g('first'), last: g('last'), dob: g('dob'), year: g('year'), school: g('school'), gender: g('gender'), about: g('about'),
        medical: g('medical'), allergies: g('allergies'), medication: g('medication'), dietary: g('dietary'),
        send: g('send'), sendDetails: g('send') === 'Yes' ? g('sendDetails') : '',
      };
    }),
    emergency: {
      name: val('emergency.name'), relationship: val('emergency.relationship'), phone: val('emergency.phone'),
      altPhone: val('emergency.altPhone'), collectors: val('emergency.collectors'),
    },
    consents: {
      photo: val('consents.photo'), firstAid: val('consents.firstAid'), marketing: val('consents.marketing') === true,
      accurate: val('consents.accurate') === true, terms: val('consents.terms') === true, privacy: val('consents.privacy') === true,
    },
    notes: val('notes'),
  });

  const showError = (data, status) => {
    errorBox.textContent = '';
    const msg = (data && data.error) || (status === 0
      ? 'We couldn’t reach our booking system. Check your connection and try again.'
      : 'Sorry, something went wrong. Please try again.');
    errorBox.append(msg);
    if (data && Array.isArray(data.details) && data.details.length) {
      const ul = document.createElement('ul');
      data.details.forEach((d) => { const li = document.createElement('li'); li.textContent = d; ul.appendChild(li); });
      errorBox.appendChild(ul);
    }
    if (status === 503 || status === 0 || status >= 500) {
      const p = document.createElement('p');
      p.style.marginTop = '8px';
      p.append('You can also ');
      const a = document.createElement('a');
      a.href = 'contact.html?programme=saturday';
      a.textContent = 'send us an enquiry';
      p.append(a, ' and we’ll help you book.');
      errorBox.appendChild(p);
    }
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Payment Link mode: one button per payment (or one payment with a quantity to set).
  const showPayments = (data) => {
    const money = (p) => '£' + (p / 100).toFixed(p % 100 ? 2 : 0);
    const box = document.createElement('div');
    box.className = 'paybox';
    box.tabIndex = -1;
    const h = document.createElement('h3');
    h.textContent = 'Last step: pay to confirm your place';
    const intro = document.createElement('p');
    intro.append('We’ve received your details. Your booking reference is ');
    const b = document.createElement('b');
    b.textContent = data.ref;
    intro.append(b, `. Your place is confirmed once ${money(data.total)} has been paid.`);
    box.append(h, intro);
    const single = data.payments.length === 1;
    const tip = document.createElement('p');
    tip.className = 'notice notice--warm';
    tip.textContent = single
      ? `On the payment page, please set the quantity to ${data.payments[0].quantity} so the total is ${money(data.total)}.`
      : `Please complete all ${data.payments.length} payments below. Each one opens Stripe’s secure payment page in a new tab.`;
    box.appendChild(tip);
    const list = document.createElement('div');
    list.className = 'paybox__list';
    data.payments.forEach((p, i) => {
      const a = document.createElement('a');
      a.className = 'btn btn--accent paybox__btn';
      a.href = p.url;
      if (!single) { a.target = '_blank'; a.rel = 'noopener'; }
      a.textContent = single ? `Pay ${money(p.amount)} securely` : `Payment ${i + 1} of ${data.payments.length}: ${money(p.amount)} · ${p.label}`;
      a.addEventListener('click', () => {
        if (single) return;
        a.classList.add('is-done');
        a.textContent = `✓ Opened: ${money(p.amount)} · ${p.label}`;
      });
      list.appendChild(a);
    });
    box.appendChild(list);
    const help = document.createElement('p');
    help.className = 'hint';
    help.style.marginTop = '14px';
    help.append('Problem paying? ');
    const c = document.createElement('a');
    c.href = 'contact.html?programme=saturday';
    c.textContent = 'Contact us';
    help.append(c, ` and quote ${data.ref}.`);
    box.appendChild(help);
    $('[data-nav]', form).hidden = true;
    $('[data-review]', form).replaceWith(box);
    $('.wiz__intro', steps[steps.length - 1]).hidden = true;
    progress.hidden = true;
    box.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (let i = 0; i < steps.length - 1; i++) {
      if (!validate(steps[i])) { go(i, true); validate(steps[i]); return; }
    }
    const original = payLabel.textContent;
    submitBtn.disabled = true;
    payLabel.textContent = 'Taking you to secure payment…';
    let redirecting = false;
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.mode === 'links' && Array.isArray(data.payments)) {
        clearTimeout(saveTimer);
        draftsOn = false;
        local.del(LOCAL_KEY);
        session.del(SESSION_KEY);
        const only = data.payments.length === 1 && data.payments[0].quantity === 1;
        if (only) {
          redirecting = true;
          window.location.href = data.payments[0].url;
          return;
        }
        showPayments(data);
        return;
      }
      if (res.ok && data.url) {
        redirecting = true;
        window.location.href = data.url;
        return;
      }
      showError(data, res.status);
    } catch (err) {
      showError(null, 0);
    } finally {
      if (!redirecting) {
        submitBtn.disabled = false;
        payLabel.textContent = original;
      }
    }
  });

  /* ---------- Start up ---------- */
  const params = new URLSearchParams(location.search);
  const cancelled = params.get('cancelled') === '1';
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || params.has('preview');

  const start = (status) => {
    if (status && Array.isArray(status.sessions)) sessions = status.sessions;
    const ready = !!(status && status.ready);
    $('[data-testmode]').hidden = !(status && status.testMode);
    if (!ready) {
      $('[data-closed]').hidden = false;
      if (!isLocal) { $('[data-booking-wrap]').hidden = true; return; }
    }
    renderDates();
    if (status && status.options) {
      ['block', 'single'].forEach((key) => {
        if (status.options[key]) return;
        const input = $(`input[name="option"][value="${key}"]`, form);
        input.disabled = true;
        input.checked = false;
        const small = $('small', input.nextElementSibling);
        if (small) small.textContent = 'Not available online yet. Please contact us.';
      });
    }
    addKid(false);
    const restored = restoreDraft();
    syncHealth();
    applyIf();
    updateSummary();
    if (cancelled && restored) {
      $('[data-cancelled]').hidden = false;
      go(steps.length - 1, true);
    } else {
      go(0, true);
    }
  };

  fetch(API, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(start);
})();
