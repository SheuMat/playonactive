# PlayOn Active — Website

A fast, mobile-friendly static website for **PlayOn Active**, a multi-sport physical
literacy provider for UK primary schools (PE curriculum & PPA cover, after-school
clubs and holiday camps).

## Pages
| File | Purpose |
|------|---------|
| `index.html` | Home — overview of all three services, approach, social proof |
| `for-schools.html` | School sales page — PE/PPA, Sport Premium, rates, how it works |
| `after-school-clubs.html` | After-school multi-sport clubs (schools + parents) |
| `holiday-camps.html` | Holiday camps — themed weeks, wraparound care, pricing (parents) |
| `our-approach.html` | Physical literacy framework, the ABCs, what makes us different |
| `contact.html` | Contact details + free-taster / enquiry form |

## Brand
- Navy `#18306C`, Orange `#FC8400` (sampled from the logo in the business documents)
- Font: Poppins (Google Fonts)
- Logo: `assets/img/logo.png` (+ transparent + favicon versions), extracted from
  the supplied Word/PowerPoint files.

## Viewing it
Just open `index.html` in a browser. Everything is self-contained — no build step.
For clean local testing you can also run a tiny server from this folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Before going live — to do
1. **Logo background.** `logo.png` has a white background (fine on white headers).
   `logo-transparent.png` is provided if you want it on a coloured background.
2. **Contact form.** The form is a front-end demo — it shows a success message but
   does not send email yet. Connect it to your inbox via a service like
   Formspree, Netlify Forms, or your own backend (see `assets/js/main.js`).
3. **Real details.** Replace placeholders: phone number, exact service area,
   social media links (Facebook/Instagram/LinkedIn in the footer), and the email
   if it differs from `hello@playonactive.co.uk`.
4. **Photos.** Stock placeholder photos are now in place for the main image panels
   and documented in `IMAGES.md`. Replace them with PlayOn Active's own consented
   session photography before launch.
5. **Testimonials.** The homepage testimonials are clearly marked as illustrative —
   replace with real quotes as pilot schools come on board.
6. **Pricing.** All rates are marked "indicative" and pulled from the business
   plan; confirm before publishing.

## Structure
```
website/
├── index.html
├── for-schools.html
├── after-school-clubs.html
├── holiday-camps.html
├── our-approach.html
├── contact.html
└── assets/
    ├── css/styles.css
    ├── js/main.js
    └── img/  (logo.png, logo-transparent.png, favicon.png)
```
