/* PlayOn Active – site interactions. No dependencies. */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  /* ---------- Header shadow + floating enquiry button ---------- */
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

  /* ---------- Scroll reveal + stepped "how it works" ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));

    $$('[data-steps]').forEach((list) => {
      const so = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        $$('.step', list).forEach((s, i) => setTimeout(() => s.classList.add('is-on'), 350 + i * 450));
        so.disconnect();
      }, { threshold: 0.4 });
      so.observe(list);
    });
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* ---------- Tabs (service switcher, sports, timelines, age groups) ---------- */
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
    const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    if (initial) {
      tabs.forEach((t) => { t.tabIndex = t === initial ? 0 : -1; });
    }
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

  /* ---------- Flip cards (camp themes) ---------- */
  $$('[data-flip]').forEach((card) => {
    const front = $('.theme__front', card);
    const back = $('.theme__back', card);
    back.inert = true;
    $$('.theme__flip', card).forEach((btn) => {
      btn.addEventListener('click', () => {
        const flipped = !card.classList.contains('is-flipped');
        card.classList.toggle('is-flipped', flipped);
        front.inert = flipped;
        back.inert = !flipped;
        $('.theme__flip', flipped ? back : front).focus({ preventScroll: true });
      });
    });
  });

  /* ---------- Packing checklist ---------- */
  $$('[data-checklist]').forEach((list) => {
    const key = 'poa-check-' + list.dataset.checklist;
    const boxes = $$('input[type="checkbox"]', list);
    const status = $('[data-checklist-status]', list);
    const bar = $('[data-checklist-bar]', list);
    const saved = store.get(key) || [];
    boxes.forEach((b, i) => { b.checked = !!saved[i]; });
    const update = () => {
      const n = boxes.filter((b) => b.checked).length;
      status.textContent = n === boxes.length ? 'All packed. Have a brilliant day!' : `${n} of ${boxes.length} packed`;
      bar.style.width = (n / boxes.length) * 100 + '%';
      store.set(key, boxes.map((b) => b.checked));
    };
    boxes.forEach((b) => b.addEventListener('change', update));
    update();
  });

  /* ---------- Session finder (home) ---------- */
  const finder = $('[data-finder]');
  if (finder) {
    const SERVICES = {
      clubs: { name: 'After-School Clubs', url: 'after-school-clubs.html', c: 'var(--orange-2)', bg: 'var(--c-clubs-soft)',
        blurb: 'Multi-sport clubs on your child’s school site, straight after the bell.' },
      camps: { name: 'Holiday Camps', url: 'holiday-camps.html', c: 'var(--c-camps)', bg: 'var(--c-camps-soft)',
        blurb: 'Themed, full days of sport and games, with early drop-off and late pick-up available.' },
      saturday: { name: 'Saturday Club', url: 'saturday-club.html', c: 'var(--c-sat)', bg: 'var(--c-sat-soft)',
        blurb: 'Weekend multi-sport sessions with children from other schools.' },
    };
    const AGES = {
      early: 'For Reception and Year 1, sessions are playful and build balance, coordination and confidence.',
      mid: 'For Years 2 and 3, the focus is core skills like throwing, catching and dodging, plus teamwork.',
      upper: 'For Years 4 to 6, expect sport-specific skills, tactics and friendly competition.',
    };
    const result = $('[data-finder-result]', finder);
    const state = { when: null, age: null };

    const render = () => {
      if (!state.when) { result.hidden = true; return; }
      const s = SERVICES[state.when];
      result.style.setProperty('--r-c', s.c);
      result.style.setProperty('--r-bg', s.bg);
      const ageTxt = state.age ? AGES[state.age] : 'Choose a school year to see what they’ll focus on.';
      result.innerHTML =
        `<div class="txt"><span class="tag">Our suggestion</span><h3>${s.name}</h3><p>${s.blurb} ${ageTxt}</p></div>` +
        `<div class="btns"><a class="btn btn--navy" href="${s.url}">Find out more</a>` +
        `<a class="btn btn--primary" href="contact.html?service=${state.when}">Enquire</a></div>`;
      result.hidden = false;
      result.style.animation = 'none'; void result.offsetWidth; result.style.animation = '';
    };

    [['when', 'data-when'], ['age', 'data-age']].forEach(([key, attr]) => {
      const btns = $$(`[${attr}]`, finder);
      const choose = (b) => {
        btns.forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
        state[key] = b.getAttribute(attr);
        render();
      };
      btns.forEach((b, i) => {
        b.tabIndex = i === 0 ? 0 : -1;
        b.addEventListener('click', () => choose(b));
        b.addEventListener('keydown', (e) => {
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          const n = btns[(i + d + btns.length) % btns.length];
          choose(n); n.focus();
        });
      });
    });
  }

  /* ---------- Enquiry wizard ---------- */
  const wizard = $('[data-wizard]');
  if (wizard) initWizard(wizard);

  function initWizard(form) {
    const steps = $$('[data-step]', form);
    const progress = $('[data-progress]', form);
    const count = $('[data-count]', form);
    const nav = $('[data-nav]', form);
    const prevBtn = $('[data-prev]', form);
    const nextBtn = $('[data-next]', form);
    const submitBtn = $('[data-submit]', form);
    const kidsWrap = $('[data-kids]', form);
    const healthWrap = $('[data-health]', form);
    const addKidBtn = $('[data-add-kid]', form);
    const kidTpl = $('#kid-tpl');
    const healthTpl = $('#health-tpl');
    const draftNote = $('[data-draft-note]', form);
    const doneBox = $('[data-done]', form);
    const errorBox = $('[data-error]', form);
    const DRAFT_KEY = 'poa-enquiry-draft';
    const MAX_KIDS = 6;
    const EMAIL = 'hello@playonactive.co.uk';
    let current = 0;
    let errSeq = 0;

    /* -- which parts of the form apply -- */
    const tokens = () => {
      const t = new Set($$('input[name="enquiry_type"]:checked', form).map((i) => i.dataset.token));
      if (t.has('clubs') || t.has('camps') || t.has('saturday')) t.add('parent');
      return t;
    };

    const applyIf = () => {
      $$('[data-if]', form).forEach((el) => {
        const [name, val] = el.dataset.if.split('=');
        const ctl = form.elements[name];
        const on = !!ctl && ctl.value === val;
        el.hidden = !on;
        $$('input, select, textarea', el).forEach((i) => { i.disabled = !on; });
      });
    };

    const applyShow = () => {
      const t = tokens();
      $$('[data-show]', form).forEach((el) => {
        const on = el.dataset.show.split(/\s+/).some((x) => t.has(x));
        if (el.matches('[data-step]')) { el.disabled = !on; return; }
        el.hidden = !on;
        if (el.tagName === 'FIELDSET') el.disabled = !on;
        else $$('input, select, textarea', el).forEach((i) => { i.disabled = !on; });
      });
      applyIf();
    };

    const activeSteps = () => steps.filter((s) => !s.disabled);

    /* -- children (repeatable) -- */
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

    const refreshKids = () => {
      const kids = kidBlocks();
      kids.forEach((k, i) => {
        setIndex(k, i + 1);
        const first = ($('[data-kid-name]', k).value || '').trim();
        const title = first || `Child ${i + 1}`;
        $('[data-kid-n]', k).textContent = i + 1;
        $('[data-kid-title]', k).textContent = title;
        $('[data-remove-kid]', k).hidden = kids.length === 1;
        const h = healthBlocks()[i];
        if (h) { setIndex(h, i + 1); $('[data-health-title]', h).textContent = title; }
      });
      addKidBtn.hidden = kids.length >= MAX_KIDS;
      applyIf();
    };
    const syncHealth = () => {
      while (healthBlocks().length < kidBlocks().length) {
        healthWrap.appendChild(fromTpl(healthTpl, healthBlocks().length + 1));
      }
      while (healthBlocks().length > kidBlocks().length) healthBlocks().pop().remove();
      refreshKids();
    };
    const addKid = (focus) => {
      if (kidBlocks().length >= MAX_KIDS) return;
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

    /* -- validation -- */
    const isLive = (el) => !el.matches(':disabled') && !el.closest('[hidden]:not([data-step])');
    const addErr = (container, msg, input) => {
      const p = document.createElement('p');
      p.className = 'err';
      p.id = 'err-' + (++errSeq);
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
      const seenRadios = new Set();

      $$('[data-required-group]', scope).forEach((g) => {
        if (!isLive(g)) return;
        const boxes = $$('input[type="checkbox"]', g);
        if (!boxes.some((b) => b.checked)) {
          g.setAttribute('aria-invalid', 'true');
          addErr(g, g.dataset.requiredGroup);
          first = first || boxes[0];
        }
      });

      $$('input, select, textarea', scope).forEach((el) => {
        if (!el.name || el.type === 'hidden' || el.name === '_gotcha' || !isLive(el)) return;
        if (el.type === 'radio') {
          if (!el.required || seenRadios.has(el.name)) return;
          seenRadios.add(el.name);
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
            const d = new Date(v);
            const years = (Date.now() - d.getTime()) / 31557600000;
            if (isNaN(d.getTime()) || years < 0 || years > 18) msg = 'Enter a valid date of birth.';
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

    /* -- labels & values (for review + email summary) -- */
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
      if (el.type === 'date' && el.value) {
        const [y, m, d] = el.value.split('-');
        return `${d}/${m}/${y}`;
      }
      return el.value.trim();
    };

    const collect = () => {
      const sections = [];
      activeSteps().forEach((step) => {
        if (step.dataset.step === 'review') return;
        const rows = [];
        const seen = new Set();
        let lastBlock = null;
        $$('input, select, textarea', step).forEach((el) => {
          if (!el.name || el.type === 'hidden' || el.name === '_gotcha' || !isLive(el) || seen.has(el.name)) return;
          const block = el.closest('[data-kid], [data-health-kid]');
          if (block !== lastBlock) {
            if (block) {
              const t = $('[data-kid-title], [data-health-title]', block);
              rows.push({ sub: t ? t.textContent : 'Child' });
            } else {
              const sub = el.closest('fieldset.sub');
              rows.push({ sub: sub ? cleanText($('legend', sub)) : 'Other details' });
            }
          }
          lastBlock = block;
          let value = '';
          if (el.type === 'checkbox' || el.type === 'radio') {
            seen.add(el.name);
            const picked = $$(`input[name="${el.name}"]`, form).filter((i) => i.checked && isLive(i)).map((i) => i.value);
            if (el.type === 'checkbox' && $$(`input[name="${el.name}"]`, form).length === 1) value = picked.length ? 'Yes' : '';
            else value = picked.join(', ');
          } else {
            value = valueOf(el);
          }
          if (value) rows.push({ label: labelOf(el), value });
        });
        const filled = rows.filter((r) => !r.sub);
        if (filled.length) sections.push({ step: step.dataset.step, title: step.dataset.title, rows });
      });
      return sections;
    };

    const buildReview = () => {
      const wrap = $('[data-review]', form);
      wrap.textContent = '';
      collect().forEach((sec) => {
        const box = document.createElement('section');
        box.className = 'review__sec';
        const head = document.createElement('div');
        head.className = 'review__head';
        const h = document.createElement('h3');
        h.textContent = sec.title;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => go(activeSteps().findIndex((s) => s.dataset.step === sec.step)));
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

    const summaryText = () => {
      const lines = ['New enquiry from the PlayOn Active website', ''];
      collect().forEach((sec) => {
        lines.push(`== ${sec.title.toUpperCase()} ==`);
        sec.rows.forEach((r) => lines.push(r.sub ? `-- ${r.sub} --` : `${r.label}: ${r.value}`));
        lines.push('');
      });
      return lines.join('\n');
    };

    /* -- navigation -- */
    const renderProgress = () => {
      const act = activeSteps();
      progress.textContent = '';
      act.forEach((s, i) => {
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
      count.textContent = `Step ${current + 1} of ${act.length}`;
    };

    const go = (index, quiet) => {
      const act = activeSteps();
      current = Math.max(0, Math.min(index, act.length - 1));
      steps.forEach((s) => { s.hidden = true; });
      const step = act[current];
      if (step.dataset.step === 'health') syncHealth();
      if (step.dataset.step === 'review') buildReview();
      step.hidden = false;
      const last = current === act.length - 1;
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

    nextBtn.addEventListener('click', () => {
      if (validate(activeSteps()[current])) go(current + 1);
    });
    prevBtn.addEventListener('click', () => go(current - 1));

    form.addEventListener('change', (e) => {
      if (e.target.name === 'enquiry_type') { applyShow(); renderProgress(); }
      else applyIf();
    });

    /* -- draft autosave (medical fields are never stored) -- */
    let saveTimer = null;
    const saveDraft = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const fields = {};
        $$('input, select, textarea', form).forEach((el) => {
          if (!el.name || el.type === 'hidden' || el.name === '_gotcha' || el.name === 'enquiry_summary' || el.hasAttribute('data-nosave')) return;
          if (el.type === 'checkbox') {
            fields[el.name] = fields[el.name] || [];
            if (el.checked) fields[el.name].push(el.value);
          } else if (el.type === 'radio') {
            if (el.checked) fields[el.name] = el.value;
          } else if (el.value) {
            fields[el.name] = el.value;
          }
        });
        store.set(DRAFT_KEY, { v: 1, saved: Date.now(), kids: kidBlocks().length, fields });
      }, 350);
    };
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);

    const applyValues = (fields) => {
      Object.keys(fields).forEach((name) => {
        const val = fields[name];
        $$(`[name="${name}"]`, form).forEach((el) => {
          if (el.type === 'checkbox') el.checked = Array.isArray(val) && val.includes(el.value);
          else if (el.type === 'radio') el.checked = el.value === val;
          else el.value = val;
        });
      });
    };

    const restoreDraft = () => {
      const d = store.get(DRAFT_KEY);
      if (!d || !d.fields || Date.now() - d.saved > 30 * 864e5) return false;
      const hasContent = Object.values(d.fields).some((v) => (Array.isArray(v) ? v.length : v));
      if (!hasContent) return false;
      while (kidBlocks().length < Math.min(d.kids || 1, MAX_KIDS)) addKid(false);
      applyValues(d.fields);
      return true;
    };

    const resetForm = () => {
      store.del(DRAFT_KEY);
      form.reset();
      while (kidBlocks().length > 1) kidBlocks().pop().remove();
      syncHealth();
      clearErrs(form);
      applyShow();
      draftNote.hidden = true;
      go(0);
    };
    $('[data-reset]', form).addEventListener('click', resetForm);

    /* -- submit -- */
    const showDone = (fallback) => {
      steps.forEach((s) => { s.hidden = true; });
      nav.hidden = true;
      progress.hidden = true;
      draftNote.hidden = true;
      if (fallback) {
        const body = summaryText();
        const short = body.length > 1800
          ? body.slice(0, 1800) + '\n\n[Shortened to fit an email link. Please also paste the full details using "Copy details".]'
          : body;
        const mail = `mailto:${EMAIL}?subject=${encodeURIComponent('New PlayOn Active enquiry')}&body=${encodeURIComponent(short)}`;
        $('h2', doneBox).textContent = 'One last step: send it to us';
        $('p', doneBox).textContent = 'Our online form isn’t connected to email just yet. Press the button below to open your email app with your enquiry filled in, or copy the details and email them to ' + EMAIL + '.';
        const btns = $('.btns', doneBox);
        btns.textContent = '';
        const a = document.createElement('a');
        a.className = 'btn btn--primary';
        a.href = mail;
        a.textContent = 'Email my enquiry';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn btn--ghost';
        copy.textContent = 'Copy details';
        copy.addEventListener('click', () => {
          const done = () => { copy.textContent = 'Copied!'; };
          if (navigator.clipboard) navigator.clipboard.writeText(body).then(done, () => {});
        });
        btns.append(a, copy);
      } else {
        store.del(DRAFT_KEY);
      }
      doneBox.hidden = false;
      doneBox.focus({ preventScroll: true });
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const act = activeSteps();
      for (let i = 0; i < act.length; i++) {
        if (act[i].dataset.step === 'review') continue;
        if (!validate(act[i])) { go(i, true); validate(act[i]); return; }
      }
      if (form.elements._gotcha && form.elements._gotcha.value) { showDone(false); return; }

      form.elements.enquiry_summary.value = summaryText();
      const endpoint = (form.dataset.endpoint || '').trim();
      if (!endpoint) {
        console.info('[PlayOn Active] No form endpoint set (data-endpoint on #enquiry). Showing email fallback.');
        showDone(true);
        return;
      }

      const label = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showDone(false);
      } catch (err) {
        errorBox.textContent = '';
        errorBox.append('Sorry, something went wrong sending your enquiry. Please try again, or email us at ');
        const a = document.createElement('a');
        a.href = 'mailto:' + EMAIL;
        a.textContent = EMAIL;
        errorBox.append(a, '.');
        errorBox.hidden = false;
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = label;
      }
    });

    /* -- start up -- */
    addKid(false);
    const restored = restoreDraft();
    const params = new URLSearchParams(location.search);
    const svc = params.get('service');
    if (svc) {
      const box = $(`input[name="enquiry_type"][data-token="${svc}"]`, form);
      if (box) box.checked = true;
    }
    const hol = params.get('holiday');
    if (hol) {
      const box = $$('input[name="camps_holidays"]', form).find((i) => i.value === hol);
      if (box) box.checked = true;
    }
    syncHealth();
    applyShow();
    draftNote.hidden = !restored;
    go(0, true);
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
