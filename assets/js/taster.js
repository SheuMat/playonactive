/* PlayOn Active – Taster Day & Play Day booking. No dependencies. */
(function () {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const form = $('[data-signup]');
  if (!form) return;

  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const MAX_KIDS = 2;
  const EMAIL = 'hello@playonactive.co.uk';

  const DAYS = {
    taster: {
      eyebrow: 'Booking option 1 · Free',
      title: 'Book your free Taster Day place',
      waitTitle: 'Join the Taster Day waiting list',
      sub: 'Saturday 28 November, 10am–2pm · Southbury Primary School',
      submit: 'Book free place',
      waitSubmit: 'Join the waiting list',
      small: 'You’ll get a confirmation email straight away.',
      other: 'Booking the Play Day instead?',
    },
    playday: {
      eyebrow: 'Booking option 2 · £10 per child',
      title: 'Book the Play Day',
      sub: 'Saturday 5 December, 10am–2pm · Southbury Primary School',
      submit: 'Continue to payment',
      small: 'Secure card payment by Stripe. Your confirmation email follows.',
      other: 'Booking the free Taster Day instead?',
    },
  };

  let status = { taster: 'open', playday: 'open' };
  let ready = true;
  let current = null;
  const started = Date.now();

  if (TEST) $('[data-testmode]').hidden = false;

  /* ---------- Children ---------- */
  const kidsBox = $('[data-kids]');
  const tpl = $('#kid-tpl');
  const addBtn = $('[data-add-kid]');
  let kidSeq = 0;

  function renumberKids() {
    const kids = $$('[data-kid]', kidsBox);
    kids.forEach((k, i) => {
      $('[data-kid-n]', k).textContent = i + 1;
      $('[data-kid-title]', k).textContent = kids.length > 1 ? `Child ${i + 1}` : 'Child';
      $('[data-remove-kid]', k).hidden = i === 0;
    });
    $('[data-kids-title]').textContent = kids.length > 1 ? 'Your children' : 'Your child';
    addBtn.hidden = kids.length >= MAX_KIDS;
  }

  function addKid(focus) {
    kidSeq += 1;
    const html = tpl.innerHTML.replace(/__N__/g, String(kidSeq));
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const kid = wrap.firstElementChild;
    kidsBox.appendChild(kid);
    renumberKids();
    if (focus) $('[data-c="name"]', kid).focus();
  }

  addBtn.addEventListener('click', () => addKid(true));
  kidsBox.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-kid]');
    if (!rm) return;
    rm.closest('[data-kid]').remove();
    renumberKids();
    addBtn.focus();
  });
  addKid(false);

  /* ---------- Choosing a day ---------- */
  const wrap = $('[data-form-wrap]');
  const done = $('[data-done]');

  function label(day) {
    const d = DAYS[day];
    const waiting = day === 'taster' && status.taster === 'waitlist';
    $('[data-f-eyebrow]').textContent = d.eyebrow;
    $('[data-f-title]').textContent = waiting ? d.waitTitle : d.title;
    $('[data-f-sub]').textContent = d.sub;
    $('[data-submit-label]').textContent = waiting ? d.waitSubmit : d.submit;
    $('[data-f-small]').textContent = waiting ? 'If a place comes up, we’ll email you straight away.' : d.small;
    $('[data-switch]').textContent = d.other;
    $('[data-f-waitnote]').hidden = !waiting;
    $('[data-f-paynote]').hidden = day !== 'playday';
    form.classList.toggle('is-play', day === 'playday');
  }

  function open(day, scroll = true) {
    if (status[day] === 'closed' || status[day] === 'full') return;
    current = day;
    label(day);
    wrap.hidden = false;
    form.hidden = false;
    done.hidden = true;
    clearErrors();
    if (scroll) {
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => $('#p_name').focus({ preventScroll: true }), 450);
    }
    try { history.replaceState(null, '', `${location.pathname}${location.search}#book-${day === 'taster' ? 'taster' : 'play-day'}`); } catch (e) { /* ignore */ }
  }

  $$('[data-pick]').forEach((b) => b.addEventListener('click', () => open(b.dataset.pick)));
  $('[data-switch]').addEventListener('click', () => {
    const other = current === 'taster' ? 'playday' : 'taster';
    if (status[other] === 'closed' || status[other] === 'full') return;
    open(other);
  });

  function applyStatus() {
    const setLabel = (day, text) => $$('[data-pick-label="' + day + '"]').forEach((el) => { el.textContent = text; });
    const disable = (day) => $$('[data-pick="' + day + '"]').forEach((el) => { el.disabled = true; });
    const tState = $('[data-state="taster"]');
    const pState = $('[data-state="playday"]');
    tState.hidden = true;
    pState.hidden = true;

    if (status.taster === 'waitlist') {
      setLabel('taster', 'Join the waiting list');
      tState.hidden = false;
      tState.textContent = 'The Taster Day is currently full. Join the waiting list and we’ll email you if a place comes up.';
    } else if (status.taster === 'closed') {
      setLabel('taster', 'Booking closed');
      disable('taster');
    }
    if (status.playday === 'full' || status.playday === 'closed') {
      setLabel('playday', status.playday === 'full' ? 'Fully booked' : 'Booking closed');
      disable('playday');
    }
    if (current) label(current);
  }

  fetch(`/api/signup${TEST ? '?test=1' : ''}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      if (d.ready === false) { ready = false; return; }
      status = { ...status, ...Object.fromEntries(Object.entries(d.events).map(([k, v]) => [k, v.status])) };
      applyStatus();
    })
    .catch(() => {})
    .finally(() => {
      const h = location.hash;
      if (h === '#book' || h === '#book-taster') open('taster');
      else if (h === '#book-play-day' || params.get('book') === 'playday') open('playday');
      else if (h === '#play-day') $('#play-day').scrollIntoView({ block: 'start' });
    });

  /* ---------- Validation ---------- */
  const errorsBox = $('[data-errors]');
  const serverErr = $('[data-server-error]');

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const isPhone = (v) => { const n = v.replace(/\D/g, '').length; return n >= 10 && n <= 15; };

  function fieldMsg(el, msg) {
    const host = el.closest('.field, .checkline, .group');
    let err = host.querySelector(':scope > .err');
    if (!msg) {
      el.removeAttribute('aria-invalid');
      if (host.matches('.group')) host.removeAttribute('aria-invalid');
      if (err) err.remove();
      return;
    }
    el.setAttribute('aria-invalid', 'true');
    if (host.matches('.group')) host.setAttribute('aria-invalid', 'true');
    if (!err) {
      err = document.createElement('p');
      err.className = 'err';
      err.id = (el.id || 'g' + Math.random().toString(36).slice(2)) + '-err';
      host.appendChild(err);
      if (el.id) el.setAttribute('aria-describedby', err.id);
    }
    err.textContent = msg;
  }

  function checkEl(el) {
    const v = (el.type === 'checkbox' ? el.checked : el.value.trim());
    let bad = false;
    if (el.required && !v) bad = true;
    else if (el.type === 'email' && v && !isEmail(v)) bad = true;
    else if (el.dataset.type === 'phone' && v && !isPhone(v)) bad = true;
    else if (el.required && el.type === 'text' && v.length < 2) bad = true;
    fieldMsg(el, bad ? el.dataset.msg : '');
    return !bad;
  }

  function checkGroup(g) {
    const ok = $$('input', g).some((i) => i.checked);
    fieldMsg($('input', g), ok ? '' : g.dataset.msg);
    return ok;
  }

  function clearErrors() {
    errorsBox.hidden = true;
    serverErr.hidden = true;
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    $$('.err', form).forEach((el) => el.remove());
  }

  form.addEventListener('blur', (e) => {
    const el = e.target;
    if (el.matches('input[required], select[required], textarea[required], input[data-type], input[type=email]') && el.type !== 'checkbox' && el.value) checkEl(el);
  }, true);
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type === 'checkbox' && el.required) checkEl(el);
    if (el.type === 'radio') checkGroup(el.closest('[data-radio]'));
    if (el.tagName === 'SELECT' && el.hasAttribute('aria-invalid')) checkEl(el);
  });

  function validate() {
    const problems = [];
    $$('input[required], select[required], textarea[required], input[data-type="phone"], input[type="email"]', form).forEach((el) => {
      if (!checkEl(el)) problems.push({ el, msg: el.dataset.msg });
    });
    $$('[data-radio]', form).forEach((g) => { if (!checkGroup(g)) problems.push({ el: $('input', g), msg: g.dataset.msg }); });
    // keep page order
    problems.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return problems;
  }

  function showProblems(list, title) {
    errorsBox.replaceChildren();
    const h = document.createElement('p');
    h.className = 'tform__errors-h';
    h.textContent = title || `Please check ${list.length === 1 ? 'one thing' : `${list.length} things`}:`;
    const ul = document.createElement('ul');
    list.forEach((p) => {
      const li = document.createElement('li');
      if (p.el) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = p.msg;
        a.addEventListener('click', (e) => { e.preventDefault(); p.el.focus(); p.el.scrollIntoView({ block: 'center' }); });
        li.appendChild(a);
      } else {
        li.textContent = p.msg;
      }
      ul.appendChild(li);
    });
    errorsBox.append(h, ul);
    errorsBox.hidden = false;
    errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    errorsBox.focus({ preventScroll: true });
  }

  /* ---------- Collect ---------- */
  function collect() {
    const out = { event: current, parent: {}, emergency: {}, consents: {}, children: [], website: $('[data-hp]').value, elapsed: Date.now() - started };
    $$('[data-k]', form).forEach((el) => {
      const [a, b] = el.dataset.k.split('.');
      let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
      else v = el.value.trim();
      if (b) out[a][b] = v; else out[a] = v;
    });
    if (!out.consents.photo) out.consents.photo = '';
    $$('[data-kid]', kidsBox).forEach((k) => {
      const c = {};
      $$('[data-c]', k).forEach((el) => { c[el.dataset.c] = el.value.trim(); });
      out.children.push(c);
    });
    if (TEST) out.test = true;
    return out;
  }

  /* ---------- Done screens ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tick = '<div class="tick"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>';
  const clock = '<div class="tick tick--wait"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div>';

  function showDone(html) {
    form.hidden = true;
    done.innerHTML = html;
    done.hidden = false;
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    done.focus({ preventScroll: true });
  }

  function doneTaster(r) {
    const ref = r.ref ? `<p class="tdone__ref">Booking reference <b>${esc(r.ref)}</b></p>` : '';
    if (r.status === 'waitlist') {
      showDone(`${clock}<h2>You’re on the waiting list</h2>
        <p>The Taster Day is full at the moment. If a place comes up it’s given to the next family in line automatically, and we’ll email <b>${esc(r.email || 'you')}</b> straight away.</p>${ref}
        <p class="tdone__alt">Can’t wait? You can <a href="#play-day" data-goto-play>book the Play Day on 5 December</a> instead.</p>`);
      const g = $('[data-goto-play]', done);
      if (g) g.addEventListener('click', (e) => { e.preventDefault(); open('playday'); });
      return;
    }
    showDone(`${tick}<h2>You’re booked!</h2>
      <p>Your free Taster Day place is confirmed. We’ve emailed your confirmation to <b>${esc(r.email || 'you')}</b>.</p>${ref}
      <ul class="tdone__facts">
        <li><b>When</b> Saturday 28 November, 10am–2pm</li>
        <li><b>Where</b> Southbury Primary School, Swansea Road, Enfield EN3 4JG</li>
        <li><b>Bring</b> A packed lunch and a water bottle (light snack provided)</li>
      </ul>
      <p class="tdone__promo">Complete our quick feedback survey after the day and get the Play Day on 5 December for just £5 (usually £10). Your £5 link will be emailed to you, so please don’t book the Play Day yet.</p>
      <p class="tdone__small">Can’t make it any more? Use the cancel link in your email so another child can have the place.</p>`);
  }

  function donePlay(r) {
    if (r.payments.length === 1) {
      showDone(`${tick}<h2>Taking you to secure payment…</h2><p>Your details are saved (reference <b>${esc(r.ref)}</b>). If nothing happens, <a href="${esc(r.payments[0].url)}">tap here to pay £10</a>.</p>`);
      setTimeout(() => { location.href = r.payments[0].url; }, 900);
      return;
    }
    const btns = r.payments.map((p, i) =>
      `<a class="btn btn--primary btn--lg btn--block paybtn" href="${esc(p.url)}" target="_blank" rel="noopener" data-pay="${i}">Pay £10 for ${esc(p.label.split(' – ').pop())}</a>`).join('');
    showDone(`${tick}<h2>Nearly done: please pay</h2>
      <p>Your details are saved (reference <b>${esc(r.ref)}</b>). Our £10 payment link is one child per payment, so please make <b>one payment for each child</b>:</p>
      <div class="paylist">${btns}</div>
      <p class="tdone__small">Each button opens Stripe in a new tab. We’ve also emailed these links to <b>${esc(r.email)}</b>.</p>`);
    $$('[data-pay]', done).forEach((a) => a.addEventListener('click', () => {
      setTimeout(() => { a.classList.add('is-done'); a.textContent = `✓ Opened: ${a.textContent.replace(/^✓ Opened: /, '')}`; }, 300);
    }));
  }

  /* ---------- Submit ---------- */
  const btn = $('[data-submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current) return;
    clearErrors();
    const problems = validate();
    if (problems.length) { showProblems(problems); return; }
    if (!ready) {
      serverErr.innerHTML = `Online booking opens very soon. In the meantime, email <a href="mailto:${EMAIL}">${EMAIL}</a> and we’ll book you in.`;
      serverErr.hidden = false;
      return;
    }
    const keep = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = current === 'playday' ? 'Saving your details…' : 'Booking…';
    try {
      const res = await fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collect()) });
      const r = await res.json().catch(() => ({}));
      if (res.ok) {
        if (current === 'taster') doneTaster(r); else donePlay(r);
        return;
      }
      if (res.status === 422 && Array.isArray(r.details)) {
        showProblems(r.details.map((msg) => ({ msg })));
      } else {
        serverErr.textContent = r.error || 'Something went wrong. Please try again.';
        serverErr.hidden = false;
        serverErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      serverErr.innerHTML = `We couldn’t connect just now. Please check your signal and try again, or email <a href="mailto:${EMAIL}">${EMAIL}</a>.`;
      serverErr.hidden = false;
    } finally {
      btn.disabled = false;
      btn.innerHTML = keep;
    }
  });
})();
