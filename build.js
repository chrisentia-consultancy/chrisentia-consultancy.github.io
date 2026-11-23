#!/usr/bin/env node
/* ==========================================================================
   Chrisentia Consultancy — static site build
   ==========================================================================

   Takes the sources in src/ + data/ and writes a plain static site to dist/.
   No dependencies, no npm install. Just: node build.js

   What it does:
     1. Reads data/*.json          — the single source of truth for content
     2. Reads src/partials/*.html  — head, nav, footer (each written once)
     3. Reads src/pages/*.html     — one file per page, with placeholders
     4. Writes dist/               — finished HTML with everything inlined
     5. Copies assets/, images/, videos/ and generates sitemap.xml

   Why a build step: the nav and footer used to be fetched by JavaScript after
   the page loaded, which made the header flash in late and hid the navigation
   from search engines. Now they are part of the HTML before it ever ships.

   Placeholders available in pages and partials:
     {{> name}}            include src/partials/name.html
     {{title}}             from the page's front-matter comment
     {{description}}       from front-matter
     {{canonicalPath}}     from front-matter
     {{site.a.b}}          any path into data/site.json
     {{year}}              current year
     {{active.index}}      aria-current="page" on the matching nav link
     {{structuredData}}    LocalBusiness JSON-LD
     {{phoneList}}         footer phone <li> items
     {{servicesGrid}}      service cards from data/services.json
     {{featuredProjects}}  home page project cards
     {{caseStudies}}       solutions page project cards
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const STATIC_DIRS = ['assets', 'images', 'videos'];
const STATIC_FILES = ['robots.txt'];

/* --- helpers ------------------------------------------------------------- */

const read = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => JSON.parse(read(p));

/** Escape text going into HTML so a stray & or < in the JSON can't break a page. */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Look up "site.address.street" style paths in an object. */
function lookup(obj, dotted) {
  return dotted.split('.').reduce(
    (acc, key) => (acc === undefined || acc === null ? undefined : acc[key]),
    obj
  );
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/**
 * Pages start with an HTML comment holding their metadata, e.g.
 *
 *   <!--
 *   title: Chrisentia Consultancy
 *   description: Industrial automation across Sri Lanka.
 *   canonicalPath:
 *   -->
 */
function parseFrontMatter(raw) {
  const match = raw.match(/^\s*<!--([\s\S]*?)-->/);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!key) continue;
    meta[key] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

/* --- icons and card visuals --------------------------------------------- */

/** Inlines src/icons/<name>.svg so it inherits text colour. */
function icon(name, className) {
  const file = path.join(SRC, 'icons', `${name}.svg`);
  if (!fs.existsSync(file)) {
    console.warn(`  ! no icon src/icons/${name}.svg`);
    return '';
  }
  const svg = read(file).trim();
  return className ? svg.replace('<svg ', `<svg class="${className}" `) : svg;
}

/**
 * A raster image in src/icons/ with the same name wins over the SVG:
 * machine-vision.png (or .jpg .jpeg .webp .avif .gif) is used if present,
 * otherwise machine-vision.svg. The image is copied into dist/assets/icons/.
 */
const ICON_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'];

function iconImage(name) {
  const dir = path.join(SRC, 'icons');
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => {
    const ext = path.extname(f);
    return path.basename(f, ext) === name && ICON_IMAGE_EXTENSIONS.includes(ext.toLowerCase());
  });
  if (!match) return null;
  const outDir = path.join(DIST, 'assets', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(path.join(dir, match), path.join(outDir, match));
  return `assets/icons/${match}`;
}

/**
 * Top of a service or Why card. An image becomes a full-width banner across
 * the top of the card; with no image, the SVG sits in a small tile.
 */
function cardVisual(name) {
  const img = iconImage(name);
  if (img) {
    return `<div class="card-banner">
              <img src="${esc(img)}" alt="" loading="lazy" decoding="async" />
            </div>`;
  }
  return `<div class="icon-tile">
              ${icon(name, 'icon-tile__svg')}
            </div>`;
}

/* --- content blocks ------------------------------------------------------ */

function renderPhoneList(site) {
  return site.phones
    .map(
      (phone) => `<li class="flex items-center gap-3">
            <span class="material-symbols-outlined text-slate-400" aria-hidden="true">phone_in_talk</span>
            <a href="tel:${esc(phone.tel)}" class="hover:text-white transition-colors">${esc(phone.label)}</a>
          </li>`
    )
    .join('\n          ');
}

function renderServicesGrid(services) {
  return services
    .map(
      (service) => `<div class="service-card glass-panel hover-card">
            ${cardVisual(service.icon)}
            <h3 class="card-title">${esc(service.title)}</h3>
            <p class="card-text">${esc(service.summary)}</p>${
              service.tools
                ? `\n            <p class="service-tools">${esc(service.tools)}</p>`
                : ''
            }
          </div>`
    )
    .join('\n\n          ');
}

/**
 * Why cards sit sideways: picture on the left, text on the right, with a
 * faint number behind. The picture is an image from src/icons/ if one exists,
 * otherwise the SVG drawn large in a tinted box, so both kinds line up.
 */
function whyVisual(name) {
  const img = iconImage(name);
  if (img) {
    return `<div class="why-card__media">
              <img src="${esc(img)}" alt="" loading="lazy" decoding="async" />
            </div>`;
  }
  return `<div class="why-card__media why-card__media--icon">
              ${icon(name, 'why-card__svg')}
            </div>`;
}

function renderWhyGrid(why) {
  return why.cards
    .map(
      (card, i) => {
        const sdgs = (card.sdgs || []).length
          ? `<div class="sdg-block">
                <p class="sdg-block__label">UN Sustainable Development Goals</p>
                <ul class="sdg-chips">
                  ${card.sdgs
                    .map(
                      (g) =>
                        `<li class="sdg-chip"${g.color ? ` style="--sdg:${esc(g.color)}"` : ''}><span>${esc(g.number)}</span><small>${esc(g.label)}</small></li>`
                    )
                    .join('\n                  ')}
                </ul>
              </div>`
          : '';
        return `<article class="why-card${card.wide ? ' why-card--wide' : ''}">
            ${whyVisual(card.icon)}
            <div class="why-card__body">
              <span class="why-card__number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
              <h3 class="card-title why-card__title">${esc(card.title)}</h3>
              <div class="why-card__content">
                <ul class="why-list">
                  ${card.points.map((pt) => `<li>${esc(pt)}</li>`).join('\n                  ')}
                </ul>
                ${sdgs}
              </div>
            </div>
          </article>`;
      }
    )
    .join('\n\n      ');
}

/** How we work: numbered steps, each a short title and one sentence. */
function renderProcessSteps(process) {
  return process.steps
    .map(
      (step, i) => `<li class="process-step">
            <span class="process-step__marker" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
            <h3 class="card-title process-step__title">${esc(step.title)}</h3>
            <p class="process-step__text">${esc(step.text)}</p>
          </li>`
    )
    .join('\n          ');
}

/* --- Project media ------------------------------------------------------- */

/**
 * Visuals for a project are whatever sits in images/projects/<slug>/.
 *
 * Nothing is configured per project. Files are sorted by name, so a numeric
 * prefix (01-, 02-) sets the order and the first file becomes the hero.
 * Video autoplays muted on loop. Two or more images become a crossfade
 * carousel. An empty folder renders a typographic card rather than a gap,
 * so a project can ship before its photographs exist.
 */
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'];

function readProjectMedia(slug) {
  const dir = path.join(ROOT, 'images', 'projects', slug);
  if (!fs.existsSync(dir)) return { videos: [], images: [] };

  const videos = [];
  const images = [];

  for (const file of fs.readdirSync(dir).sort()) {
    if (file.startsWith('.')) continue;
    const ext = path.extname(file).toLowerCase();
    const rel = `images/projects/${slug}/${file}`;
    if (VIDEO_EXTENSIONS.includes(ext)) videos.push(rel);
    else if (IMAGE_EXTENSIONS.includes(ext)) images.push(rel);
  }

  return { videos, images };
}

/** The visual block for one project. `index` is 1-based, for the fallback card. */
function renderProjectMedia(project, index) {
  const { videos, images } = readProjectMedia(project.slug);
  const label = esc(project.title);

  if (!videos.length && !images.length) {
    return `<div class="project-media project-media--empty">
              <span class="project-media__index">${String(index).padStart(2, '0')}</span>
              <span class="project-media__label">${label}</span>
            </div>`;
  }

  // Video leads when present. No zoom — the framing is the client's, not ours.
  if (videos.length) {
    const poster = images.length ? ` poster="${esc(images[0])}"` : '';
    return `<div class="project-media">
              <video autoplay muted loop playsinline preload="metadata"${poster} aria-label="${label}">
                <source src="${esc(videos[0])}" type="video/mp4" />
              </video>
            </div>`;
  }

  if (images.length === 1) {
    return `<div class="project-media project-media--single">
              <img src="${esc(images[0])}" alt="${label}" loading="lazy" decoding="async" />
            </div>`;
  }

  const slides = images
    .map(
      (src, i) =>
        `<img src="${esc(src)}" alt="${label}" loading="lazy" decoding="async"${i === 0 ? ' class="is-active"' : ''} />`
    )
    .join('\n                ');

  const dots = images
    .map(
      (src, i) =>
        `<button type="button" class="project-media__dot${i === 0 ? ' is-active' : ''}" data-slide="${i}" aria-label="Image ${i + 1} of ${images.length}"></button>`
    )
    .join('\n                ');

  return `<div class="project-media project-media--carousel" data-carousel>
              ${slides}
              <div class="project-media__dots">
                ${dots}
              </div>
            </div>`;
}

/** Home page: each card links to its write-up on the Projects page. */
function renderFeaturedProjects(projects) {
  // Four keep the two-column grid even; the rest are on the Projects page.
  return projects
    .slice(0, 4)
    .map(
      (project, i) => `<a class="group project-link" href="solutions.html#${esc(project.slug)}">
            ${renderProjectMedia(project, i + 1)}
            <h3 class="font-h3 text-2xl font-bold mt-6 mb-2">${esc(project.title)}</h3>
            <p class="text-on-surface-variant">${esc(project.cardLine)}</p>
            <span class="project-link__cta">
              View project
              <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </span>
          </a>`
    )
    .join('\n\n          ');
}

/** Solutions page: full write-ups. */
function renderCaseStudies(projects) {
  return projects
    .map((project, i) => {
      const tags = (project.tags || [])
        .map((t) => `<span class="project-tag">${esc(t)}</span>`)
        .join('\n                ');
      const body = project.body
        .map((para) => `<p class="text-on-surface-variant text-lg leading-relaxed">${esc(para)}</p>`)
        .join('\n              ');

      return `<article id="${esc(project.slug)}" class="project-entry reveal">
            <div class="project-entry__media">
              ${renderProjectMedia(project, i + 1)}
            </div>
            <div class="project-entry__body">
              <div class="project-entry__number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div>
              <h2 class="font-h2 text-3xl md:text-4xl font-bold mb-4">${esc(project.title)}</h2>
              <div class="project-tags mb-6">
                ${tags}
              </div>
              ${body}
            </div>
          </article>`;
    })
    .join('\n\n          ');
}

/**
 * Client cards, scrolling.
 *
 * Each card: left side has an optional backdrop image (images/clients/bg/<slug>.*)
 * under a dark overlay, with the sector and a one-line blurb on top; right side
 * has the logo (images/clients/<slug>.*), the name and Client or Partner.
 * Any image extension works for both. The row is rendered twice so the scroll
 * can loop seamlessly; the copy is hidden from screen readers.
 */
const IMAGE_EXTS = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.avif'];

function findImage(dir, slug) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return null;
  const match = fs.readdirSync(full).find((f) => {
    const ext = path.extname(f);
    return path.basename(f, ext) === slug && IMAGE_EXTS.includes(ext.toLowerCase());
  });
  return match ? `${dir}/${match}` : null;
}

function renderClientCards(clientsData) {
  const clients = clientsData.clients.filter((c) => c.published);
  if (!clients.length) return '';

  const missing = [];

  const card = (client, isClone) => {
    const logo = findImage('images/clients', client.slug);
    const backdrop = findImage('images/clients/bg', client.slug);
    if (!logo && !isClone) missing.push(client.slug);

    const hidden = isClone ? ' aria-hidden="true"' : '';
    const bg = backdrop ? ` style="background-image:url('${esc(backdrop)}')"` : '';
    const mark = logo
      ? `<img src="${esc(logo)}" alt="${esc(client.name)} logo" loading="lazy" decoding="async" />`
      : `<span class="client-card__wordmark">${esc(client.name)}</span>`;

    return `<article class="client-card"${hidden}>
          <div class="client-card__story"${bg}>
            <span class="client-card__sector">${esc(client.sector || '')}</span>
            <p class="client-card__blurb">${esc(client.blurb || '')}</p>
          </div>
          <div class="client-card__brand">
            <div class="client-card__logo">${mark}</div>
            <span class="client-card__name">${esc(client.name)}</span>
            <span class="client-card__role">${esc(client.relationship || 'Client')}</span>
          </div>
        </article>`;
  };

  if (missing.length) {
    console.log(`  note   no logo in images/clients/ for: ${missing.join(', ')}`);
  }

  const once = clients.map((c) => card(c, false)).join('\n        ');
  const clone = clients.map((c) => card(c, true)).join('\n        ');
  return `${once}\n        ${clone}`;
}

/** Scroll speed scales with the number of cards so it never races. */
function clientScrollSeconds(clientsData) {
  return clientsData.clients.filter((c) => c.published).length * 9;
}

/** Phone list for the contact card (lighter styling than the footer's). */
function renderContactPhoneList(site) {
  return site.phones
    .map(
      (phone) => `<li>
            <span class="material-symbols-outlined" aria-hidden="true">phone_in_talk</span>
            <a href="tel:${esc(phone.tel)}">${esc(phone.label)}</a>
          </li>`
    )
    .join('\n          ');
}

function renderStructuredData(site) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'ProfessionalService',
      name: site.name,
      description: site.description,
      url: site.url,
      logo: `${site.url}/${site.logo}`,
      image: `${site.url}/${site.logo}`,
      email: site.email,
      telephone: site.phones.map((p) => p.tel),
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.address.street,
        addressLocality: site.address.locality,
        addressCountry: site.address.countryCode
      },
      areaServed: { '@type': 'Country', name: site.address.country },
      sameAs: Object.values(site.social)
    },
    null,
    2
  );
}

/* --- cache busting ------------------------------------------------------- */

/**
 * Adds ?v=<hash of the file> to our own CSS and JS links. When a file changes,
 * its link changes, so browsers (and GitHub Pages' cache) fetch the new copy
 * instead of showing a stale one. Unchanged files keep the same link and stay
 * cached.
 */
const crypto = require('crypto');
const VERSIONED_ASSETS = ['assets/css/main.css', 'assets/js/main.js', 'assets/js/tailwind-config.js'];

function versionAssets(html) {
  let out = html;
  for (const asset of VERSIONED_ASSETS) {
    const file = path.join(ROOT, asset);
    if (!fs.existsSync(file)) continue;
    const hash = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
    out = out.split(`"${asset}"`).join(`"${asset}?v=${hash}"`);
  }
  return out;
}

/* --- template engine ----------------------------------------------------- */

function render(template, ctx, partials) {
  let out = template;

  // Includes first, so partials can use every other placeholder.
  // Looped to allow a partial to include another partial.
  for (let pass = 0; pass < 5 && /\{\{>\s*[\w-]+\s*\}\}/.test(out); pass++) {
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (whole, name) => {
      if (!(name in partials)) {
        throw new Error(`Unknown partial "${name}"`);
      }
      return partials[name];
    });
  }

  // Everything else.
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => {
    const value = lookup(ctx, key);
    if (value === undefined || value === null) {
      console.warn(`  ! unresolved placeholder {{${key}}}`);
      return '';
    }
    return String(value);
  });

  return out;
}

/* --- build --------------------------------------------------------------- */

function build() {
  const site = readJSON(path.join(ROOT, 'data', 'site.json'));
  const services = readJSON(path.join(ROOT, 'data', 'services.json'));
  const projects = readJSON(path.join(ROOT, 'data', 'projects.json'));
  const clients = readJSON(path.join(ROOT, 'data', 'clients.json'));
  const why = readJSON(path.join(ROOT, 'data', 'why.json'));
  const process = readJSON(path.join(ROOT, 'data', 'process.json'));

  const partials = {};
  const partialDir = path.join(SRC, 'partials');
  for (const file of fs.readdirSync(partialDir)) {
    if (file.endsWith('.html')) {
      partials[path.basename(file, '.html')] = read(path.join(partialDir, file));
    }
  }

  // Start clean so a deleted page never lingers in dist/.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const shared = {
    site,
    year: new Date().getFullYear(),
    structuredData: renderStructuredData(site),
    phoneList: renderPhoneList(site),
    contactPhoneList: renderContactPhoneList(site),
    clientCards: renderClientCards(clients),
    clientScrollSeconds: clientScrollSeconds(clients),
    servicesGrid: renderServicesGrid(services),
    whyGrid: renderWhyGrid(why),
    processSteps: renderProcessSteps(process),
    processKicker: esc(process.kicker),
    processHeadline: esc(process.headline),
    iconBadge: (() => {
      const img = iconImage('hero-badge');
      return img
        ? `<img class="hero-badge__img" src="${esc(img)}" alt="" />`
        : icon('robotics', 'hero-badge__icon');
    })(),
    projectCount: projects.projects.length,
    iconArrowRight: icon('arrow-right', 'btn__icon'),
    iconArrowDown: icon('arrow-down', 'btn__icon'),
    whyKicker: esc(why.kicker || 'Why Chrisentia'),
    whyHeadline: esc(why.headline || ''),
    whyIntro: esc(why.intro),
    featuredProjects: renderFeaturedProjects(projects.projects),
    caseStudies: renderCaseStudies(projects.projects)
  };

  const pageDir = path.join(SRC, 'pages');
  const pages = fs.readdirSync(pageDir).filter((f) => f.endsWith('.html'));
  const built = [];

  for (const file of pages) {
    const { meta, body } = parseFrontMatter(read(path.join(pageDir, file)));
    const slug = path.basename(file, '.html');

    const ctx = {
      ...shared,
      title: meta.title || site.name,
      description: meta.description || site.description,
      canonicalPath: meta.canonicalPath !== undefined ? meta.canonicalPath : file,
      active: {
        index: slug === 'index' ? ' aria-current="page"' : '',
        services: slug === 'services' ? ' aria-current="page"' : '',
        solutions: slug === 'solutions' ? ' aria-current="page"' : ''
      }
    };

    fs.writeFileSync(path.join(DIST, file), versionAssets(render(body, ctx, partials)), 'utf8');
    built.push(file);
    console.log(`  built  ${file}`);
  }

  for (const dir of STATIC_DIRS) {
    copyDir(path.join(ROOT, dir), path.join(DIST, dir));
    console.log(`  copied ${dir}/`);
  }

  for (const file of STATIC_FILES) {
    const from = path.join(ROOT, file);
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(DIST, file));
      console.log(`  copied ${file}`);
    }
  }

  // Sitemap, from whatever actually got built. 404 is excluded.
  const today = new Date().toISOString().slice(0, 10);
  const urls = built
    .filter((f) => f !== '404.html')
    .map((f) => {
      const loc = f === 'index.html' ? `${site.url}/` : `${site.url}/${f}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
    })
    .join('\n');

  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    'utf8'
  );
  console.log('  wrote  sitemap.xml');

  // GitHub Pages serves .nojekyll-aware; this stops Jekyll touching the output.
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '', 'utf8');

  console.log(`\nBuilt ${built.length} pages into dist/`);
}

try {
  console.log('Building Chrisentia Consultancy site...\n');
  build();
} catch (err) {
  console.error('\nBuild failed:', err.message);
  process.exit(1);
}
