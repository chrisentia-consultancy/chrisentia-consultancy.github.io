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
            <p class="text-on-surface-variant">${esc(service.summary)}</p>
          </div>`
    )
    .join('\n\n          ');
}

function renderFeaturedProjects(projects) {
  return projects
    .map(
      (project, i) => `<article class="group">
            <div class="overflow-hidden rounded-3xl mb-6 shadow-md relative aspect-video bg-gray-100">
              <img src="${esc(project.image)}" alt="${esc(project.alt)}" loading="lazy" decoding="async"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              <div class="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
            </div>
            <h3 class="font-h3 text-2xl font-bold mb-2 group-hover:text-slate-800 transition-colors">${i + 1}. ${esc(project.title)}</h3>
            <p class="text-on-surface-variant">${esc(project.summary)}</p>
          </article>`
    )
    .join('\n\n          ');
}

function renderCaseStudies(projects) {
  return projects
    .map(
      (project, i) => `<article class="project-card p-6 md:p-10 rounded-3xl relative overflow-hidden group">
            <div class="project-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</div>
            <h3 class="font-h3 text-2xl font-bold mb-4 pr-16 relative z-10">${esc(project.title)}</h3>
            <p class="text-on-surface-variant text-lg mb-6 relative z-10">${esc(project.summary)}</p>
            <div class="w-full h-48 rounded-2xl overflow-hidden mb-6">
              <img src="${esc(project.image)}" alt="${esc(project.alt)}" loading="lazy" decoding="async"
                class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
            </div>
          </article>`
    )
    .join('\n\n          ');
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
    servicesGrid: renderServicesGrid(services),
    featuredProjects: renderFeaturedProjects(projects.featured),
    caseStudies: renderCaseStudies(projects.caseStudies)
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
