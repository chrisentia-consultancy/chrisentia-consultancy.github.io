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
      (service) => `<div class="glass-panel p-8 rounded-3xl hover-card">
            <div class="h-14 w-14 bg-slate-800/10 rounded-2xl flex items-center justify-center mb-6">
              <span class="material-symbols-outlined text-3xl text-slate-800" aria-hidden="true">${esc(service.icon)}</span>
            </div>
            <h3 class="font-h3 text-xl font-bold mb-3">${esc(service.title)}</h3>
            <p class="text-on-surface-variant">${esc(service.summary)}</p>${
              service.tools
                ? `\n            <p class="service-tools">${esc(service.tools)}</p>`
                : ''
            }
          </div>`
    )
    .join('\n\n          ');
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

/** Home page: compact cards for every project. */
function renderFeaturedProjects(projects) {
  return projects
    .map(
      (project, i) => `<article class="group">
            ${renderProjectMedia(project, i + 1)}
            <h3 class="font-h3 text-2xl font-bold mt-6 mb-2">${esc(project.title)}</h3>
            <p class="text-on-surface-variant">${esc(project.cardLine)}</p>
          </article>`
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

      return `<article class="project-entry reveal">
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
 * Client logos.
 *
 * The logo file is found by slug, whatever its extension — drop
 * images/clients/unilever.png or .svg or .jpg and it just works. A client
 * with no file yet renders as a text tile instead of a broken image, so the
 * list can go live before every logo has arrived.
 *
 * The track is duplicated so the marquee can loop seamlessly. The copy is
 * aria-hidden so screen readers announce each client once.
 */
const LOGO_EXTENSIONS = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.avif'];

function findLogo(slug) {
  const dir = path.join(ROOT, 'images', 'clients');
  if (!fs.existsSync(dir)) return null;
  for (const ext of LOGO_EXTENSIONS) {
    for (const candidate of [slug + ext, slug + ext.toUpperCase()]) {
      if (fs.existsSync(path.join(dir, candidate))) {
        return `images/clients/${candidate}`;
      }
    }
  }
  return null;
}

function renderClientLogos(clientsData) {
  const clients = clientsData.clients.filter((c) => c.published);
  if (!clients.length) return '';

  let missing = 0;

  const tile = (client, isClone) => {
    const logo = findLogo(client.slug);
    const hidden = isClone ? ' aria-hidden="true"' : '';
    const role = isClone ? '' : ' role="listitem"';

    if (!logo) {
      if (!isClone) missing++;
      return `<div class="logo-marquee__item logo-marquee__item--text"${role}${hidden}>
            <span>${esc(client.name)}</span>
          </div>`;
    }

    return `<div class="logo-marquee__item"${role}${hidden}>
            <img src="${esc(logo)}" alt="${esc(client.name)}" loading="lazy" decoding="async" />
          </div>`;
  };

  const once = clients.map((c) => tile(c, false)).join('\n          ');
  const clone = clients.map((c) => tile(c, true)).join('\n          ');

  if (missing) {
    console.log(
      `  note   ${missing} client logo(s) not found in images/clients/ — showing name tiles instead`
    );
  }

  return `${once}\n          ${clone}`;
}

/** Phone list for the contact card (lighter styling than the footer's). */
function renderContactPhoneList(site) {
  return site.phones
    .map(
      (phone) => `<li class="flex items-center gap-3">
              <span class="material-symbols-outlined text-slate-500" aria-hidden="true">phone_in_talk</span>
              <a href="tel:${esc(phone.tel)}" class="hover:text-slate-800 font-semibold">${esc(phone.label)}</a>
            </li>`
    )
    .join('\n            ');
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
    clientLogos: renderClientLogos(clients),
    servicesGrid: renderServicesGrid(services),
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

    fs.writeFileSync(path.join(DIST, file), render(body, ctx, partials), 'utf8');
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
