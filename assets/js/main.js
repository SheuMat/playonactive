/* PlayOn Active – site interactions. No dependencies. */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const EMAIL = 'hello@playonactive.co.uk';

  /* ---------- Header shadow + floating booking button ---------- */
  const hdr = $('[data-hdr]');
  const fab = $('[data-fab]');
  const onScroll = () => {
    const y = window.scrollY;
    if (hdr) hdr.classList.toggle('is-scrolled', y > 8);
    if (fab) fab.classList.toggle('is-shown', y > 500);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile drawer ---------- */
  const burger = $('[data-burger]');
  const drawer = $('[data-drawer]');
  if (burger && drawer) {
    const setOpen = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      drawer.classList.toggle('is-open', open);
    };
    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    drawer.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setOpen(false); burger.focus(); }
    });
  }

  /* ---------- Scroll reveal ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Tabs ---------- */
  $$('[data-tabs]').forEach((group) => {
    const tabs = $$('[role="tab"]', group).filter((t) => t.closest('[data-tabs]') === group);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !on;
        if (on) { panel.classList.remove('is-in'); void panel.offsetWidth; panel.classList.add('is-in'); }
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const map = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        let n = null;
        if (e.key in map) n = tabs[(i + map[e.key] + tabs.length) % tabs.length];
        else if (e.key === 'Home') n = tabs[0];
        else if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  });

  /* ---------- Accordions ---------- */
  $$('[data-acc]').forEach((acc) => {
    $$('.acc__q', acc).forEach((q) => {
      q.addEventListener('click', () => {
        const item = q.closest('.acc__item');
        const open = !item.classList.contains('is-open');
        $$('.acc__item.is-open', acc).forEach((o) => {
          o.classList.remove('is-open');
          $('.acc__q', o).setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('is-open', open);
        q.setAttribute('aria-expanded', String(open));
      });
    });
  });

  /* ---------- Holiday shortcuts: tick the holiday and jump to the form ---------- */
  $$('[data-pick-holiday]').forEach((link) => {
    link.addEventListener('click', () => {
      const box = $$('input[name="holidays"]').find((i) => i.value === link.dataset.pickHoliday);
      if (box) box.checked = true;
    });
  });

  /* ---------- Contact form: pre-select programme from ?programme= ---------- */
  const prog = new URLSearchParams(location.search).get('programme');
  if (prog) {
    const opt = $(`#q_prog option[data-key="${prog}"]`);
    if (opt) opt.selected = true;
  }

  /* ---------- Simple forms (contact + holiday camp interest) ---------- */
  $$('[data-simple-form]').forEach((form) => {
    const kind = form.dataset.simpleForm;
    const msg = $('[data-form-msg]', form);
    const btn = $('button[type="submit"]', form);
    const opened = Date.now();

    const showMsg = (type, text, extra) => {
      msg.className = `form-msg form-msg--${type}`;
      msg.textContent = text;
      if (extra) msg.appendChild(extra);
      msg.hidden = false;
    };
    const clearErrs = () => {
      $$('.err', form).forEach((e) => e.remove());
      $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'));
    };
    const addErr = (el, text) => {
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = text;
      (el.closest('.field, .group, .checkline') || el.parentElement).appendChild(p);
    };
    const validate = () => {
      clearErrs();
      let first = null;
      $$('[data-required-group]', form).forEach((g) => {
        if (!$$('input[type="checkbox"]', g).some((b) => b.checked)) {
          g.setAttribute('aria-invalid', 'true');
          addErr(g, g.dataset.requiredGroup);
          first = first || $('input', g);
        }
      });
      $$('input[required], select[required], textarea[required]', form).forEach((el) => {
        let bad = '';
        if (el.type === 'checkbox') bad = el.checked ? '' : 'Please tick this box to continue.';
        else if (!el.value.trim()) bad = 'This field is required.';
        else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim())) bad = 'Enter a valid email address.';
        if (bad) { el.setAttribute('aria-invalid', 'true'); addErr(el, bad); first = first || el; }
      });
      const phone = form.elements.phone;
      if (phone && phone.value.trim() && phone.value.replace(/\D/g, '').length < 10) {
        phone.setAttribute('aria-invalid', 'true');
        addErr(phone, 'Enter a valid phone number.');
        first = first || phone;
      }
      if (first) first.focus();
      return !first;
    };
    form.addEventListener('input', (e) => {
      const box = e.target.closest('.field, .group, .checkline');
      if (box) { $$('.err', box).forEach((x) => x.remove()); e.target.removeAttribute('aria-invalid'); }
    });
    form.addEventListener('change', (e) => {
      const box = e.target.closest('.group, .checkline');
      if (box) { $$('.err', box).forEach((x) => x.remove()); box.removeAttribute('aria-invalid'); }
    });

    const data = () => {
      const f = form.elements;
      const base = { kind, name: f.name.value.trim(), email: f.email.value.trim(), website: f.website.value, elapsed: Date.now() - opened };
      if (kind === 'camp-interest') {
        return { ...base, phone: f.phone.value.trim(), children: f.children.value.trim(), consent: f.consent.checked,
          holidays: $$('input[name="holidays"]:checked', form).map((i) => i.value) };
      }
      return { ...base, programme: f.programme.value, message: f.message.value.trim() };
    };

    const mailFallback = (d) => {
      const lines = Object.entries(d)
        .filter(([k, v]) => !['kind', 'website', 'elapsed'].includes(k) && v !== '' && v !== false)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      const subject = kind === 'camp-interest' ? 'Holiday camp interest' : `Website enquiry (${d.programme})`;
      const a = document.createElement('a');
      a.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
      a.textContent = 'Email it to us instead';
      a.className = 'btn btn--ghost btn--sm';
      a.style.marginTop = '12px';
      const wrap = document.createElement('div');
      wrap.appendChild(a);
      return wrap;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.hidden = true;
      if (!validate()) return;
      const d = data();
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
        const out = await res.json().catch(() => ({}));
        if (res.ok) {
          const ok = document.createElement('div');
          ok.className = 'form-ok';
          ok.innerHTML = '<div class="tick"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>';
          const h = document.createElement('h3');
          h.textContent = kind === 'camp-interest' ? 'You’re on the list!' : 'Thanks, message sent!';
          const p = document.createElement('p');
          p.textContent = kind === 'camp-interest'
            ? 'We’ll email you as soon as holiday camp dates and booking details are confirmed.'
            : 'We’ll get back to you within two working days.';
          ok.append(h, p);
          form.replaceChildren(ok);
          ok.setAttribute('tabindex', '-1');
          ok.focus();
          return;
        }
        if (res.status === 422 && Array.isArray(out.details)) {
          const ul = document.createElement('ul');
          out.details.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
          showMsg('err', out.error || 'Please check the form.', ul);
        } else {
          showMsg('info', 'Our online form isn’t connected just yet, but you can still reach us by email.', mailFallback(d));
        }
      } catch (err) {
        showMsg('info', 'We couldn’t send that just now, but you can still reach us by email.', mailFallback(d));
      } finally {
        if (form.contains(btn)) { btn.disabled = false; btn.innerHTML = label; }
      }
    });
  });

  /* ---------- Booking confirmation page ---------- */
  const confirmBox = $('[data-confirm]');
  if (confirmBox) {
    try { localStorage.removeItem('poa-booking'); sessionStorage.removeItem('poa-booking-health'); } catch (e) { /* ignore */ }
    const id = new URLSearchParams(location.search).get('session_id');
    if (id) {
      fetch(`/api/booking-status?session_id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => {
          if (!b) return;
          const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
          $('[data-c-ref]').textContent = b.ref;
          $('[data-c-dates]').textContent = b.dates.map(fmt).join(', ');
          $('[data-c-kids]').textContent = b.children.join(', ');
          $('[data-c-total]').textContent = '£' + (b.total / 100).toFixed(b.total % 100 ? 2 : 0);
          $('[data-confirm-details]').hidden = false;
          if (b.email) $('[data-confirm-lead]').textContent = `Your Saturday Club place is booked. We've emailed your confirmation to ${b.email}.`;
          if (!b.paid) {
            $('[data-confirm-title]').textContent = 'Your payment is being processed';
            $('[data-confirm-lead]').textContent = 'We’ll email you as soon as your payment is confirmed.';
          }
        })
        .catch(() => {});
    }
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
