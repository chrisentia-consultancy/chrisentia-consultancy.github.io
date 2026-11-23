# Chrisentia Consultancy — website

Static site built from `src/` and `data/`, deployed to GitHub Pages by GitHub
Actions on every push to `main`.

## Quick start

```bash
node build.js                          # build into dist/
python -m http.server 8000 -d dist     # preview at http://localhost:8000
```

Node 18+ is required. No dependencies, no `npm install`.
Read what the build prints: anything other than `built`, `copied` and `wrote`
lines (a missing icon, an unresolved placeholder, a missing logo) needs a look.

## Where things live

```
src/pages/       index, services, solutions (Projects), 404
src/partials/    head, nav, footer, contact, clients, stats, why
src/icons/       SVG icons, plus any image that replaces one (see below)
data/            all wording and content that appears on the site
assets/css/      main.css (all custom styling)
assets/js/       main.js (behaviour), tailwind-config.js (colours, fonts)
images/          photos, logos, project media
videos/          hero video
build.js         stitches everything into dist/
dist/            generated output: never edit, git-ignored
```

**A fact appears once.** If the same text needs changing in two places, it
belongs in `data/`.

## Common edits

| To change | Edit |
| --- | --- |
| Email, phones, address, social links, the three statistics | `data/site.json` |
| A service card | `data/services.json` |
| Why Chrisentia cards, headline, SDG chips | `data/why.json` |
| How we work steps (Services page) | `data/process.json` |
| Client cards: sector, description, Client/Partner | `data/clients.json` |
| Projects (first four in the list show on the home page) | `data/projects.json` |
| Menu | `src/partials/nav.html` |
| A page's browser title or search description | comment block at the top of the page in `src/pages/` |

## Images that drop in by name

| What | Put it here | Name it |
| --- | --- | --- |
| Service or Why card image (replaces its icon) | `src/icons/` | the card's `icon` value, e.g. `machine-vision.png` |
| Hero badge image (replaces the robot icon) | `src/icons/` | `hero-badge.png` |
| Client logo | `images/clients/` | the client's `slug`, e.g. `unilever.png` |
| Client card background | `images/clients/bg/` | the client's `slug` |
| Project media (first file is the hero; video plays, images rotate) | `images/projects/<slug>/` | number files `01-`, `02-` to set order |
| Hero video | `videos/` | `hero-automation.mp4` |

Any of `.png`, `.jpg`, `.jpeg`, `.webp` work for images; `.mp4` for video.
Remove an image and the icon or placeholder comes back.

## Layout rules (keep new sections consistent)

Every section is built the same way:

```html
<section class="section section--plain reveal">   <!-- or section--tint / section--dark -->
  <div class="wrap">
    <div class="section-head">
      <p class="section-kicker">Label</p>
      <h2 class="section-title">Heading</h2>
      <p class="section-sub">Optional one line.</p>
    </div>
    ...content...
  </div>
</section>
```

- `.wrap` gives every section the same width and left edge.
- `.section` gives every section the same spacing.
- Light sections alternate `section--plain` and `section--tint`.
- Card titles use `.card-title`. Buttons use `.btn btn--primary` or `.btn btn--secondary`.

## Deployment

`.github/workflows/deploy.yml` runs the build and publishes `dist/`.
GitHub Pages **Source** must be **GitHub Actions** (Settings → Pages).

CSS and JS links get a version tag from their contents at build time, so
visitors always receive the latest styles after a push.
