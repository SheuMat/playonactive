# PlayOn Active website

Static website for PlayOn Active: multi-sport **After-School Clubs**, **Holiday Camps**
and a **Saturday Club** for primary-age children. Plain HTML, CSS and JavaScript with
no framework and no dependencies, so it can be hosted anywhere that serves static files.

## Pages

| Page | File | Highlights |
|---|---|---|
| Home | `index.html` | Session finder, service switcher, sports explorer, how it works, FAQs |
| After-School Clubs | `after-school-clubs.html` | "Inside a session" timeline, who it suits, schools strip |
| Holiday Camps | `holiday-camps.html` | Flip-card themes, day-at-camp timeline, register-interest by holiday, packing checklist |
| Saturday Club | `saturday-club.html` | Age-group tabs, why Saturdays, practical info |
| About | `about.html` | Physical literacy explorer, the ABCs, safety & standards |
| Contact | `contact.html` | Multi-step enquiry form (see below) |

Each service has its own colour: clubs = orange, camps = blue, Saturday = green.
No prices appear anywhere on the site; pricing is handled through enquiries.

## Editing pages

Header, footer and `<head>` are shared. **Don't edit the root `.html` files directly.**
Edit the page bodies in `_src/pages/`, then rebuild:

```bash
python3 _build/build.py
```

Icons are written as `{{icon:name}}` in the page sources (see the `ICONS` list in
`_build/build.py`). The build also adds a version tag to the CSS/JS links so visitors
always get the latest styles after an update.

## Enquiry form

The form adapts to what the visitor chooses:

- **Parents** (club, camp or Saturday): their details and address, each child (up to 6),
  session preferences, health/SEND/allergies, emergency contact and authorised
  collectors, photo/first-aid/sun cream consents, then a review screen.
- **Schools** wanting a club: school details, year groups, days, start date and funding.
- **General questions**: just contact details and the question.

Unfinished enquiries are saved in the visitor's browser and restored when they come
back. Medical and SEND answers are deliberately **not** saved.

### Connecting it to email (to do before launch)

Right now the form isn't connected to an inbox. Until it is, pressing **Send** shows
an "email us your enquiry" screen (with the enquiry pre-filled), so nothing is lost.

To connect it:

1. Create a free form at a form service such as [Formspree](https://formspree.io)
   and set it to deliver to your inbox.
2. Copy the form's URL (e.g. `https://formspree.io/f/abcdwxyz`).
3. In `_src/pages/contact.html`, paste it into `data-endpoint=""` on the `<form>`.
4. Run `python3 _build/build.py`.

Every answer is sent as its own field, plus a readable `enquiry_summary` field with
the whole enquiry laid out section by section. A hidden `_gotcha` field filters spam bots.

Because the form collects children's health information, publish a privacy notice
explaining how enquiry data is stored and for how long before going live.

## Previewing locally

```bash
python3 -m http.server 8910
```

Then open http://localhost:8910. (If the Claude preview tool can't read the OneDrive
folder, mirror the site to `~/dev/playonactive-preview` and serve it from there.)

## Before going live

1. **Connect the enquiry form** (see above) and add a privacy notice.
2. **Email address**: `hello@playonactive.co.uk` is a placeholder used in the footer,
   contact page and form fallback. Confirm or replace it.
3. **Saturday Club details**: venue and session times are described as "confirmed on
   enquiry". Add them to `_src/pages/saturday-club.html` once fixed.
4. **Photos**: the current images are licensed stock (see `IMAGES.md`). Replace them
   with your own consented session photos when you have them.
5. **Social media**: no social links are shown yet. Add them to the footer in
   `_build/build.py` once the accounts exist.
