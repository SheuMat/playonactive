# Switching on Saturday Club bookings, payments and emails

The booking system is built and tested. It needs three accounts connected before parents
can pay. Until then, the booking page shows "Online booking opens very soon" and points
parents to the enquiry form, so nothing breaks in the meantime.

## Quick start: taking bookings in about 15 minutes

You don't need your own email domain to start. The minimum is:

1. **Stripe** (<https://dashboard.stripe.com>): copy your **Secret key** from
   Developers → API keys. Then in **Settings → Customer emails**, turn on
   **Successful payments** so parents get an emailed receipt.
2. **Resend** (<https://resend.com>): sign up **using the inbox where you want bookings to
   arrive**, then create an **API key**.
3. **Vercel → your project → Settings → Environment Variables**, add:
   - `STRIPE_SECRET_KEY` = the Stripe secret key
   - `RESEND_API_KEY` = the Resend key
   - `EMAIL_TO` = the same email address you signed up to Resend with
4. **Vercel → Deployments → latest → Redeploy.**

Booking is then open:
- Parents can book and pay.
- You get each booking's full details by email.
- Parents get their Stripe receipt and see a confirmation page.

To also get **"PAID" emails**, add the Stripe webhook (step 1.4 below) and its
`STRIPE_WEBHOOK_SECRET`. To send parents a branded **PlayOn Active confirmation**, verify
your domain in Resend and add `EMAIL_FROM` (step 2 below).

> Until a domain is verified, emails come from Resend's shared address and can only be sent
> to your own Resend login email. That's why `EMAIL_TO` must match it.

---

## Full setup

**You'll need:** a Stripe account, a Resend account, access to your Vercel project, and
(for branded parent emails) a domain name you own, for example `playonactive.co.uk`.

Do everything in **test mode first**, check it works, then switch to live.

---

## 1. Stripe (takes card payments)

1. Sign in or sign up at <https://dashboard.stripe.com>.
2. Make sure **Test mode** is switched on (toggle at the top right).
3. Go to **Developers → API keys** and copy the **Secret key** (starts `sk_test_`).
4. Go to **Developers → Webhooks → Add endpoint**:
   - Endpoint URL: `https://playonactive.vercel.app/api/stripe-webhook`
     (use your own domain instead if you add one to Vercel)
   - Events to send: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Save, then copy the **Signing secret** (starts `whsec_`).
5. Optional but recommended:
   - **Settings → Branding**: add the PlayOn Active logo and colours (navy `#18306C`,
     orange `#FC8400`) so the payment page matches the site.
   - **Settings → Customer emails**: turn on "Successful payments" so parents also get a
     Stripe receipt.

## 2. Resend (sends booking confirmations and form emails)

1. Sign up at <https://resend.com>.
2. **Domains → Add domain**, enter your domain, and add the DNS records it shows you at
   your domain provider. Wait for it to show **Verified**.
3. **API Keys → Create API key** (sending access is enough). Copy it (starts `re_`).

## 3. Vercel (where the keys go)

In your Vercel project: **Settings → Environment Variables**. Add these for
**Production** (and Preview if you use it):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | your Stripe secret key (`sk_test_…` while testing) |
| `STRIPE_WEBHOOK_SECRET` | the webhook signing secret (`whsec_…`) |
| `RESEND_API_KEY` | your Resend API key (`re_…`) |
| `EMAIL_FROM` | optional until your domain is verified, e.g. `PlayOn Active <bookings@playonactive.co.uk>` |
| `EMAIL_TO` | the inbox that should receive bookings and enquiries (comma-separate several) |
| `SITE_URL` | optional: your public address, e.g. `https://playonactive.vercel.app` |

Then go to **Deployments**, open the latest one, and choose **Redeploy** so the new
settings take effect.

## 4. Test it

1. Open the booking page. You should see a yellow **Test mode** notice.
2. Make a booking and pay with Stripe's test card **4242 4242 4242 4242**, any future
   expiry date, any CVC and any postcode.
3. Check that:
   - You land on the "Thank you for booking" page with a booking reference.
   - Your inbox gets an **"awaiting payment"** email with the full details (including health
     information), then a **"PAID"** email.
   - The parent's email address gets a **booking confirmation**.
4. Also try the contact form and the holiday camp "Register your interest" form.

## 5. Go live

1. In Stripe, complete account activation (business and bank details) and switch **Test
   mode off**.
2. Copy the **live** secret key (`sk_live_…`) and create the **same webhook again in live
   mode**. It has its own `whsec_…` secret.
3. Replace `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel with the live values,
   then redeploy. The Test mode notice disappears.

## How bookings arrive

- **"Saturday Club booking SC-XXXXXX – awaiting payment"**: sent the moment a parent goes
  to pay. Contains everything: parent, children, health/SEND, emergency contact and
  permissions.
- **"PAID: Saturday Club booking SC-XXXXXX"**: sent when Stripe confirms payment. Match it
  to the earlier email by the reference. If a "PAID" email never arrives, the parent didn't
  finish paying.
- Payments also appear in the Stripe dashboard under the same reference.

## Good to know

- Prices and dates live in **`api/_lib/saturday.js`** (used for charging) and at the top of
  **`assets/js/booking.js`** (used for display). Change both together.
- Bookings for a Saturday close at **9:00am that morning**. Past Saturdays can't be booked,
  and the five-week block can only be booked before the first Saturday.
- There's **no automatic limit on places** yet. Keep an eye on numbers in your inbox or
  Stripe, and ask if you'd like a cap added.
- Refunds are made from the Stripe dashboard (**Payments → select payment → Refund**).
- Run the automated checks any time with `node _build/test-api.mjs`.
