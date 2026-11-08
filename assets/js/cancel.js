/* PlayOn Active – cancel a booking from the email link. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  if (!$('[data-cancel]')) return;
  const q = new URLSearchParams(location.search);
  const ref = q.get('ref') || '';
  const t = q.get('t') || '';
  const test = q.get('test') === '1';
  const show = (which) => ['loading', 'ask', 'done', 'missing'].forEach((k) => { $(`[data-c-${k}]`).hidden = k !== which; });
  const names = (b) => (b.children.length > 1 ? b.children.join(' and ') : b.children[0]);

  function finished(b) {
    const wasWaiting = b.cancelledFrom === 'waitlist';
    $('[data-c-done-title]').textContent = wasWaiting ? 'You’ve left the waiting list' : 'Booking cancelled';
    $('[data-c-done-text]').textContent = wasWaiting
      ? `${names(b)} ${b.children.length > 1 ? 'have' : 'has'} been taken off the ${b.eventName} waiting list. We’ve emailed you to confirm.`
      : `${names(b)}’s place at the ${b.eventName} is cancelled. Thank you for letting us know: it means another child can come. We’ve emailed you to confirm.`;
    show('done');
    $('[data-c-done]').focus();
  }

  fetch(`/api/cancel?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}${test ? '&test=1' : ''}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => {
      if (!b) return show('missing');
      if (b.status === 'cancelled') return finished(b);
      const waiting = b.status === 'waitlist';
      $('[data-c-title]').textContent = waiting ? 'Leave the waiting list?' : 'Cancel your booking?';
      $('[data-c-text]').textContent = waiting
        ? `This takes ${names(b)} off the waiting list for the ${b.eventName} (${b.dateLabel}).`
        : `This cancels ${names(b)}’s place at the ${b.eventName} (${b.dateLabel}). The place will be offered to the next family on the waiting list.`;
      $('[data-c-go]').textContent = waiting ? 'Yes, leave the waiting list' : 'Yes, cancel my booking';
      show('ask');
      $('[data-c-go]').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Cancelling…';
        try {
          const res = await fetch('/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, t, test }) });
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
          finished(out);
        } catch (err) {
          $('[data-c-error]').textContent = err.message;
          $('[data-c-error]').hidden = false;
          btn.disabled = false;
          btn.textContent = 'Try again';
        }
      });
    })
    .catch(() => show('missing'));
})();
