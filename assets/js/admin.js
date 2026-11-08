/* PlayOn Active – bookings admin page. */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  if (!$('[data-a-app]')) return;

  const q = new URLSearchParams(location.search);
  const TEST = q.get('test') === '1';
  const STORE = 'poa-admin-key';
  let key = q.get('key') || '';
  try {
    if (key) localStorage.setItem(STORE, key); else key = localStorage.getItem(STORE) || '';
  } catch (e) { /* private mode */ }
  if (q.get('key')) history.replaceState(null, '', location.pathname + (TEST ? '?test=1' : ''));

  let data = null;
  let tab = 'taster';
  let search = '';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = (path, opts = {}) => fetch(`/api/admin${path}${TEST ? (path.includes('?') ? '&' : '?') + 'test=1' : ''}`, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

  function signin() {
    $('[data-a-signin]').hidden = false;
    $('[data-a-app]').hidden = true;
  }

  $('[data-a-send]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'link' }) }).catch(() => {});
    $('[data-a-sent]').hidden = false;
  });

  async function load() {
    const res = await api('');
    if (res.status === 401) { try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ } return signin(); }
    data = await res.json();
    $('[data-a-signin]').hidden = true;
    $('[data-a-app]').hidden = false;
    $('[data-a-test]').hidden = data.ns !== 'test';
    render();
  }

  const STATUS = {
    confirmed: ['Confirmed', 'ok'],
    waitlist: ['Waiting list', 'wait'],
    awaiting_payment: ['Awaiting payment', 'wait'],
    paid: ['Paid', 'ok'],
    cancelled: ['Cancelled', 'off'],
  };

  function card(b, ev) {
    const [label, tone] = STATUS[b.status];
    const kids = b.children.map((c) => {
      const health = [c.medical && `Medical: ${c.medical}`, c.allergies && `Allergies: ${c.allergies}`, c.medication && `Medication: ${c.medication}`].filter(Boolean);
      return `<div class="adm__kid"><b>${esc(c.name)}</b> <span>${esc(c.year)} · ${esc(c.school)}</span>
        ${health.length ? `<p class="adm__flag">${health.map(esc).join('<br>')}</p>` : ''}
        ${c.needs ? `<p class="adm__note">${esc(c.needs)}</p>` : ''}</div>`;
    }).join('');
    const actions = [];
    if (b.status !== 'cancelled') actions.push(`<button type="button" class="link-btn" data-act="cancel" data-ref="${b.ref}">Cancel booking</button>`);
    if (ev.price && b.status === 'awaiting_payment') actions.push(`<button type="button" class="btn btn--navy btn--sm" data-act="paid" data-ref="${b.ref}">Mark as paid</button>`);
    if (ev.price && b.status === 'paid') actions.push(`<button type="button" class="link-btn link-btn--navy" data-act="unpaid" data-ref="${b.ref}">Mark as not paid</button>`);
    return `<article class="adm__card adm__card--${tone}">
      <header><span class="pill pill--${tone}">${label}${b.position ? ` #${b.position}` : ''}</span><span class="adm__ref">${esc(b.ref)}</span><span class="adm__when">${when(b.createdAt)}</span></header>
      ${kids}
      <dl>
        <dt>Parent/carer</dt><dd>${esc(b.parent.name)} · <a href="tel:${esc(b.parent.mobile.replace(/[^\d+]/g, ''))}">${esc(b.parent.mobile)}</a> · <a href="mailto:${esc(b.parent.email)}">${esc(b.parent.email)}</a></dd>
        <dt>Emergency</dt><dd>${esc(b.emergency.name)} · <a href="tel:${esc(b.emergency.phone.replace(/[^\d+]/g, ''))}">${esc(b.emergency.phone)}</a></dd>
        <dt>Collection</dt><dd>${esc(b.collectors)}</dd>
        <dt>Consents</dt><dd>Photos: <b>${esc(b.consents.photo)}</b> · First aid: ${b.consents.firstAid ? 'Yes' : '<b>No</b>'} · Updates: ${b.consents.marketing ? 'Yes' : 'No'}</dd>
      </dl>
      <details><summary>History</summary><ul>${b.history.map(([t, h]) => `<li>${when(t)} – ${esc(h)}</li>`).join('')}</ul></details>
      ${actions.length ? `<div class="adm__btns">${actions.join('')}</div>` : ''}
    </article>`;
  }

  function render() {
    const evs = data.events;
    $('[data-a-tabs]').innerHTML = Object.values(evs).map((e) =>
      `<button type="button" role="tab" aria-selected="${e.key === tab}" data-tab="${e.key}">${esc(e.name)}<small>${esc(e.dateLabel.replace(/ \d{4}$/, ''))}</small></button>`).join('');
    const ev = evs[tab];
    const c = ev.counts;
    const kidsOf = (s) => ev.bookings.filter((b) => b.status === s).reduce((n, b) => n + b.children.length, 0);
    const stat = (n, l) => `<div class="adm__stat"><b>${n}</b><span>${l}</span></div>`;
    $('[data-a-stats]').innerHTML = ev.price
      ? stat(c.paid, 'children paid') + stat(c.awaitingPayment, 'awaiting payment') + stat(c.cap ? `${c.cap - c.paid - c.awaitingPayment}` : 'No cap', c.cap ? 'places left' : 'places') + stat(kidsOf('cancelled'), 'cancelled')
      : stat(`${c.confirmed}/${c.cap}`, 'places taken') + stat(c.cap - c.confirmed, 'places left') + stat(c.waitlist, 'on waiting list') + stat(kidsOf('cancelled'), 'cancelled');

    const s = search.toLowerCase();
    const match = (b) => !s || JSON.stringify([b.ref, b.parent, b.children, b.emergency]).toLowerCase().includes(s);
    const groups = ev.price
      ? [['Awaiting payment', ['awaiting_payment']], ['Paid', ['paid']], ['Cancelled', ['cancelled']]]
      : [['Confirmed', ['confirmed']], ['Waiting list (in order)', ['waitlist']], ['Cancelled', ['cancelled']]];
    $('[data-a-list]').innerHTML = groups.map(([title, sts]) => {
      const list = ev.bookings.filter((b) => sts.includes(b.status) && match(b));
      const kids = list.reduce((n, b) => n + b.children.length, 0);
      const body = list.length ? list.map((b) => card(b, ev)).join('') : '<p class="hint">None yet.</p>';
      return sts[0] === 'cancelled'
        ? `<details class="adm__group"><summary><h2>${title} <span>${list.length} bookings · ${kids} children</span></h2></summary>${body}</details>`
        : `<section class="adm__group"><h2>${title} <span>${list.length} bookings · ${kids} children</span></h2>${body}</section>`;
    }).join('');
    $('[data-a-updated]').textContent = `Updated ${when(data.generatedAt)}`;
  }

  $('[data-a-tabs]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; render(); }
  });
  $('[data-a-search]').addEventListener('input', (e) => { search = e.target.value.trim(); render(); });
  $('[data-a-refresh]').addEventListener('click', load);

  $('[data-a-list]').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const ref = b.dataset.ref;
    const act = b.dataset.act;
    if (act === 'cancel' && !confirm(`Cancel booking ${ref}? The parent will be emailed${tab === 'taster' ? ' and the place given to the next family on the waiting list' : ''}.`)) return;
    b.disabled = true;
    const body = act === 'cancel' ? { action: 'cancel', ref } : { action: 'paid', ref, paid: act === 'paid' };
    const res = await api('', { method: 'POST', body: JSON.stringify({ ...body, test: TEST }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) alert(out.error || 'That didn’t work. Please refresh and try again.');
    else if (out.promoted && out.promoted.length) alert(`Cancelled. The place was given to ${out.promoted.join(', ')}, who has been emailed.`);
    load();
  });

  $('[data-a-csv]').addEventListener('click', async () => {
    const res = await api(`?event=${tab}&csv=1`);
    if (!res.ok) return alert('Couldn’t download. Please refresh and try again.');
    const blob = await res.blob();
    const name = (/filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '') || [])[1] || `playon-${tab}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  $('[data-a-reset]').addEventListener('click', async () => {
    if (!confirm('Delete all TEST bookings? Real bookings are not affected.')) return;
    await api('', { method: 'POST', body: JSON.stringify({ action: 'reset', test: true }) });
    load();
  });

  if (!key && !TEST) signin(); else load();
})();
