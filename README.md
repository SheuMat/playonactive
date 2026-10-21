# PlayOn Active website

Static website for PlayOn Active (**Saturday Club**, **Holiday Camps** and **After-School
Clubs**), hosted on Vercel at https://playonactive.vercel.app. Plain HTML, CSS and
JavaScript, plus a few small Vercel functions in `api/` for Saturday Club bookings
(Stripe) and form emails (Resend).

## Pages

| Page | Source | Notes |
|---|---|---|
| Home | `_src/pages/index.html` | Slogan, Saturday Club banner, programme cards |
| Saturday Club | `_src/pages/saturday-club.html` | Pilot info, prices, Book Now |
| Book Saturday Club | `_src/pages/book-saturday-club.html` | Booking form, then Stripe payment (`assets/js/booking.js`) |
| Booking confirmed | `_src/pages/booking-confirmed.html` | Where Stripe sends parents after paying |
| Holiday Camps | `_src/pages/holiday-camps.html` | Categories, example day, Register Your Interest form |
| After-School Clubs | `_src/pages/after-school-clubs.html` | Description and what to expect |
| About | `_src/pages/about.html` | Philosophy, founder slot (commented out), safeguarding |
| Contact | `_src/pages/contact.html` | Simple form: name, email, programme, message |
| Privacy notice | `_src/pages/privacy.html` | Please review before launch |

Prices appear only on Saturday Club content. The For Schools page has been removed.

## Editing

Header, footer and `<head>` are shared, so **edit `_src/pages/`, not the root `.html` files**.
Then rebuild:

```bash
python3 _build/build.py
```

- Photos are referenced as `{{img:key}}`. Change which photo is used in the `IMAGES`
  list in `_build/build.py`. Credits are in `IMAGES.md`.
- Icons are `{{icon:name}}` (see `ICONS` in the same file).
- **Founder section:** in `_src/pages/about.html`, uncomment the `FOUNDER SECTION` block,
  add the wording and photo, then rebuild.

## Bookings, payments and emails

See **[SETUP-PAYMENTS.md](SETUP-PAYMENTS.md)** for connecting Stripe and Resend and
going live. In short:

- `api/book.js` validates a booking, works out the price on the server, emails the full
  booking to PlayOn Active and sends the parent to Stripe Checkout.
- `api/stripe-webhook.js` emails the parent a confirmation and PlayOn Active a "PAID"
  notice once Stripe confirms payment.
- `api/enquiry.js` emails contact form messages and holiday camp interest.
- Saturday Club dates and prices: `api/_lib/saturday.js` and the top of
  `assets/js/booking.js` (keep them in sync).

Automated checks for all of this (no keys needed):

```bash
node _build/test-api.mjs
```

## Previewing locally

```bash
python3 -m http.server 8910
```

Then open http://localhost:8910. The `api/` functions don't run locally, so forms show
their "email us instead" fallback and the booking page shows its "opening soon" notice.
On localhost the booking form stays visible for testing.

## Publishing

Push to `main` on GitHub (`SheuMat/playonactive`). Vercel deploys automatically.

## Before launch

1. Connect Stripe and Resend (SETUP-PAYMENTS.md) and do a test booking.
2. Review the privacy notice, and confirm the contact email `hello@playonactive.co.uk`.
3. Add the founder section wording.
4. Replace stock photos with your own consented photos when available.
