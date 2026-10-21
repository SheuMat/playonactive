#!/usr/bin/env python3
"""Assemble the PlayOn Active site.

Page bodies live in _src/pages/*.html. Each starts with a meta block:

    <!--meta {"file": "index.html", "title": "...", "description": "...",
               "nav": "home", "body": "svc-clubs"} -->

This script wraps each body in the shared <head>, header and footer, expands
{{icon:name}} tokens into inline SVG, and writes the page to the site root.

Run from anywhere:  python3 _build/build.py
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "_src" / "pages"


def asset_version(rel):
    """Short content hash so browsers fetch fresh CSS/JS after each change."""
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]

NAV = [
    ("home", "index.html", "Home", ""),
    ("saturday", "saturday-club.html", "Saturday Club", "sat"),
    ("camps", "holiday-camps.html", "Holiday Camps", "camps"),
    ("clubs", "after-school-clubs.html", "After-School Clubs", "clubs"),
    ("about", "about.html", "About", ""),
    ("contact", "contact.html", "Contact", ""),
]

BOOK_URL = "book-saturday-club.html"

# Every photo on the site is referenced in the page sources as {{img:key}}.
# Swap a photo here and rebuild; see IMAGES.md for sources and licences.
IMAGES = {
    "hero-1": "children-soccer-game.jpg",
    "hero-2": "children-agility-balance-drills.jpg",
    "hero-3": "child-football-field.jpg",
    "sat-hero": "children-agility-balance-drills.jpg",
    "sat-choice": "children-school-gym-lineup.jpg",
    "sat-how": "children-agility-balance-drills.jpg",
    "camps-hero": "child-football-field.jpg",
    "camps-feature": "youth-basketball-session.jpg",
    "clubs-hero": "children-soccer-game.jpg",
    "clubs-feature": "children-agility-balance-drills.jpg",
    "about-hero": "children-agility-balance-drills.jpg",
    "about-feature": "children-school-gym-lineup.jpg",
}

ICONS = {
    "check": '<polyline points="20 6 9 17 4 12"/>',
    "arrow": '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    "back": '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    "calendar": '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    "users": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "school": '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "star": '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
    "shield": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    "heart": '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    "chart": '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    "ball": '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5 7 18.5M8 10 3.5 8.5"/>',
    "sparkle": '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    "pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    "mail": '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    "plus": '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    "x": '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    "smile": '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
    "bolt": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    "medal": '<circle cx="12" cy="15" r="6"/><path d="M8.5 9.5 6 2h4l2 5 2-5h4l-2.5 7.5"/>',
    "bag": '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 14h8"/>',
    "chat": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    "edit": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    "flag": '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    "lock": '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "doc": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>',
    "refresh": '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    "palette": '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
    "puzzle": '<path d="M19.4 13a2.5 2.5 0 1 0 0-2H18V7a1 1 0 0 0-1-1h-4V4.6a2.5 2.5 0 1 0-2 0V6H7a1 1 0 0 0-1 1v4h1.4a2.5 2.5 0 1 1 0 2H6v4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4z"/>',
    "card": '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
    "info": '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "compass": '<circle cx="12" cy="12" r="9"/><polygon points="16 8 13.5 13.5 8 16 10.5 10.5 16 8"/>',
    "home": '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
}


def icon(name):
    return (
        '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true" focusable="false">{ICONS[name]}</svg>'
    )


def head(meta):
    robots = '\n  <meta name="robots" content="noindex" />' if meta.get("noindex") else ""
    return f"""<!DOCTYPE html>
<html lang="en-GB" class="no-js">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{meta['title']}</title>
  <meta name="description" content="{meta['description']}" />
  <meta name="theme-color" content="#18306C" />{robots}
  <meta property="og:title" content="{meta['title']}" />
  <meta property="og:description" content="{meta['description']}" />
  <meta property="og:image" content="assets/img/{meta.get('og', 'og-image.jpg')}" />
  <link rel="icon" type="image/png" href="assets/img/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="assets/css/styles.css?v={asset_version('assets/css/styles.css')}" />
</head>
<body class="{meta.get('body', '')}">
"""


def header(active):
    links, drawer = [], []
    for key, href, label, dot in NAV:
        cur = ' aria-current="page"' if key == active else ""
        links.append(f'<a href="{href}"{cur}>{label}</a>')
        dot_html = f'<span class="dot dot--{dot}"></span>' if dot else ""
        drawer.append(f'<a href="{href}"{cur}>{dot_html}{label}</a>')
    return f"""<a class="skip" href="#main">Skip to content</a>
<header class="hdr" data-hdr>
  <div class="wrap hdr__in">
    <a class="hdr__logo" href="index.html" aria-label="PlayOn Active home"><img src="assets/img/logo.png" alt="PlayOn Active" width="130" height="54" /></a>
    <nav class="hdr__nav" aria-label="Main">
      {' '.join(links)}
    </nav>
    <div class="hdr__cta">
      <a class="btn btn--primary" href="{BOOK_URL}">Book Saturday Club</a>
      <button class="hdr__burger" type="button" aria-expanded="false" aria-controls="drawer" aria-label="Open menu" data-burger><span></span><span></span><span></span></button>
    </div>
  </div>
  <nav class="drawer" id="drawer" aria-label="Mobile" data-drawer>
    {' '.join(drawer)}
    <a class="btn btn--primary btn--block" href="{BOOK_URL}">Book Saturday Club</a>
  </nav>
</header>
"""


FOOTER = """<footer class="ftr">
  <div class="wrap ftr__grid">
    <div class="ftr__brand">
      <a class="ftr__logo" href="index.html"><img src="assets/img/logo.png" alt="PlayOn Active" width="150" height="62" loading="lazy" /></a>
      <p>Get them moving. Watch them grow. Play-based Saturday Club, holiday camps and after-school clubs for primary-age children.</p>
    </div>
    <div>
      <h2 class="ftr__h">Programmes</h2>
      <ul>
        <li><a href="saturday-club.html"><span class="dot dot--sat"></span>Saturday Club</a></li>
        <li><a href="holiday-camps.html"><span class="dot dot--camps"></span>Holiday Camps</a></li>
        <li><a href="after-school-clubs.html"><span class="dot dot--clubs"></span>After-School Clubs</a></li>
      </ul>
    </div>
    <div>
      <h2 class="ftr__h">PlayOn Active</h2>
      <ul>
        <li><a href="about.html">About us</a></li>
        <li><a href="contact.html">Contact</a></li>
        <li><a href="about.html#safeguarding">Safeguarding</a></li>
        <li><a href="privacy.html">Privacy notice</a></li>
      </ul>
    </div>
    <div>
      <h2 class="ftr__h">Saturday Club</h2>
      <ul>
        <li>Starts 7 November 2026</li>
        <li>Southbury Primary School, Enfield</li>
      </ul>
      <a class="btn btn--primary btn--sm" href="book-saturday-club.html">Book now</a>
    </div>
  </div>
  <div class="wrap ftr__base">
    <span>&copy; <span data-year>2026</span> PlayOn Active</span>
    <span><a href="privacy.html">Privacy</a> &middot; <a href="about.html#safeguarding">Safeguarding</a></span>
  </div>
</footer>
"""


def build():
    count = 0
    for src in sorted(PAGES.glob("*.html")):
        text = src.read_text(encoding="utf-8")
        m = re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->", text, re.S)
        if not m:
            raise SystemExit(f"{src.name}: missing <!--meta {{...}} --> block")
        meta = json.loads(m.group(1))
        body = text[m.end():].strip("\n")
        fab = "" if meta.get("nofab") else (
            f'<a class="fab" href="{BOOK_URL}" data-fab>{{{{icon:calendar}}}} Book Saturday Club</a>\n'
        )
        extra = "".join(
            f'<script src="{js}?v={asset_version(js)}" defer></script>\n' for js in meta.get("scripts", [])
        )
        html = (
            head(meta)
            + header(meta["nav"])
            + '<main id="main">\n'
            + body
            + "\n</main>\n"
            + FOOTER
            + fab
            + f'<script src="assets/js/main.js?v={asset_version("assets/js/main.js")}" defer></script>\n'
            + extra
            + "</body>\n</html>\n"
        )
        html = re.sub(r"\{\{icon:([a-z]+)\}\}", lambda mm: icon(mm.group(1)), html)
        html = re.sub(r"\{\{img:([a-z0-9-]+)\}\}", lambda mm: "assets/img/" + IMAGES[mm.group(1)], html)
        leftover = re.findall(r"\{\{[^}]*\}\}", html)
        if leftover:
            raise SystemExit(f"{src.name}: unknown tokens {leftover}")
        (ROOT / meta["file"]).write_text(html, encoding="utf-8")
        count += 1
        print(f"  built {meta['file']}")
    print(f"{count} pages built")


if __name__ == "__main__":
    build()
