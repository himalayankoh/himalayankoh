/**
 * Which routes actually download Supabase to the browser?
 *
 * The migration's acceptance test. It asks the built server for each route's HTML
 * and reads the `<script>` chunks that HTML injects, then checks those chunk files
 * on disk. That is what a browser really fetches — unlike Next's
 * `page_client-reference-manifest.js`, whose module map lists chunks a route may
 * never load and so reports almost everything as dirty.
 *
 * Two separate questions, with different fixes:
 *
 *   sdk     the `@supabase/supabase-js` library. It arrives whenever a module in
 *           the route's client graph imports anything from `src/lib/supabase/*`,
 *           because a bundler follows the whole module graph of an imported
 *           module: importing one pure constant from a file that also holds a
 *           `supabase.from(...)` call pulls the library in.
 *   config  the project URL / anon key that `src/lib/env.ts` publishes through
 *           `publicEnv` — carried by any route importing `publicEnv`.
 *
 * The marker strings are the SDK's own identity literals (package names, the
 * `X-Client-Info` header). Minification renames symbols but not these, so a chunk
 * carrying the library cannot avoid them; `SupabaseClient` would not work, as
 * class names are mangled.
 *
 * Needs a built app and a running server:
 *   npm run build && npx next start -p 3999 &
 *   node scripts/check-client-supabase.mjs --base-url http://127.0.0.1:3999
 *
 * Exits 1 while any route is dirty, so it can gate a deploy the way
 * check-public-origin.mjs and check-build-secrets.mjs do.
 */

import fs from 'node:fs';
import path from 'node:path';

const SDK_MARKERS = ['X-Client-Info', 'gotrue', 'realtime-js', 'storage-js', 'supabase-js-web'];
const CONFIG_MARKERS = ['supabaseUrl', 'supabaseAnonKey', 'NEXT_PUBLIC_SUPABASE'];

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const baseUrl = flagValue('--base-url', process.env.BASE_URL || 'http://127.0.0.1:3999');
const root = process.cwd();
const listAll = args.includes('--list');

const routesManifestPath = path.join(root, '.next', 'app-path-routes-manifest.json');
if (!fs.existsSync(routesManifestPath)) {
  console.error('No .next/app-path-routes-manifest.json — run `npm run build` first.');
  process.exit(2);
}
const appRoutes = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));

/**
 * Real values for dynamic segments, so those routes are measured too.
 *
 * A `[slug]` route is only measurable with a slug that exists, so these are keyed
 * by the route rather than the segment name: `/products/[...]` has a real product
 * to name, and `/resources/[...]` and `/author/[...]` are built from checked-in
 * data (`src/data`), so a real slug is always available. `/blog/[...]` has no
 * published post to name (the blog table is empty) and `/orders/[...]` needs a
 * live order, so guessing there would measure Next's not-found page instead of
 * the route. Anything without an entry here is reported as unmeasured rather than
 * silently skipped — otherwise the headline count looks better than the coverage
 * is. Keep the product entry: it is the storefront route whose Supabase config
 * leak this check exists to catch.
 */
const SAMPLE_SEGMENTS = {
  '/products/[slug]': ['himalayan-salt-6-lbs'],
  '/resources/[slug]': ['salt-block-vs-loose-salt-for-livestock'],
  '/author/[slug]': ['sourcing-team'],
};

const pageRoutes = Object.keys(appRoutes)
  .filter((r) => r.endsWith('/page'))
  .map((r) => r.replace(/\/page$/, '').replace(/\((.*?)\)\//g, '/').replace(/\/+/g, '/'))
  .map((r) => (r.startsWith('/') ? r : `/${r}`));

const routes = [];
const unmeasured = [];
/** Routes measured through a sample id — a 404 here means we measured the wrong page. */
const sampled = new Set();
for (const route of pageRoutes) {
  const dynamic = (route.match(/\[[^\]]+\]/g) ?? []).length;
  if (dynamic === 0) {
    routes.push(route);
    continue;
  }
  const sample = SAMPLE_SEGMENTS[route];
  if (!sample || sample.length !== dynamic) unmeasured.push(route);
  else {
    const resolved = route.replace(/\[[^\]]+\]/g, () => sample.shift());
    routes.push(resolved);
    sampled.add(resolved);
  }
}
routes.sort();

const chunkVerdicts = new Map();
function chunkVerdict(urlPath) {
  if (chunkVerdicts.has(urlPath)) return chunkVerdicts.get(urlPath);
  const file = path.join(root, '.next', urlPath.replace(/^\/_next\//, '').replace(/^\//, ''));
  let source = '';
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch {
    /* not a readable chunk — treat as clean */
  }
  const verdict = {
    sdk: SDK_MARKERS.some((m) => source.includes(m)),
    config: CONFIG_MARKERS.some((m) => source.includes(m)),
  };
  chunkVerdicts.set(urlPath, verdict);
  return verdict;
}

const results = [];
for (const route of routes) {
  let html;
  try {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'follow' });
    html = await response.text();
    // A dynamic route is only measurable with a live sample id. If the sample no
    // longer resolves, the HTML below is Next's not-found page — which carries no
    // product code at all, so the route would report clean while never having been
    // measured. That is a coverage failure, not a pass, so it is reported as one.
    if (sampled.has(route) && response.status !== 200) {
      results.push({
        route,
        error: `sampled route answered HTTP ${response.status} — the sample id in SAMPLE_SEGMENTS no longer resolves`,
      });
      continue;
    }
  } catch (error) {
    results.push({ route, error: String(error) });
    continue;
  }
  const scripts = new Set(html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) ?? []);
  let sdk = 0;
  let config = 0;
  const sdkChunks = [];
  for (const script of scripts) {
    const verdict = chunkVerdict(script);
    if (verdict.sdk) {
      sdk += 1;
      sdkChunks.push(script);
    }
    if (verdict.config) config += 1;
  }
  results.push({ route, sdk, config, chunks: scripts.size, sdkChunks });
}

const dirty = results.filter((r) => r.sdk > 0 || r.config > 0);
const coverageFailures = results.filter((r) => r.error);
if (listAll || dirty.length > 0) {
  for (const r of results) {
    const marks = [
      r.sdk ? `sdk(${r.sdk})` : null,
      r.config ? `config(${r.config})` : null,
      r.error ? `ERROR(${r.error})` : null,
    ].filter(Boolean);
    console.log(`${marks.length ? 'DIRTY' : 'clean'}  ${r.route}${marks.length ? `  ${marks.join(' ')}` : ''}`);
  }
  console.log('');
}

if (unmeasured.length) {
  console.log('not measured (no sample id for a dynamic segment):');
  for (const route of unmeasured.sort()) console.log(`  ${route}`);
  console.log('');
}

console.log(`routes checked: ${results.length}`);
console.log(`  downloading the Supabase SDK: ${results.filter((r) => r.sdk > 0).length}`);
console.log(`  downloading Supabase config:  ${results.filter((r) => r.config > 0).length}`);
if (coverageFailures.length) {
  console.log(`  routes that could not be measured: ${coverageFailures.length}`);
  for (const failure of coverageFailures) console.log(`    ${failure.route} — ${failure.error}`);
}

const sdkFiles = new Set();
for (const r of results) for (const c of r.sdkChunks ?? []) sdkFiles.add(c);
if (sdkFiles.size) {
  console.log('');
  console.log('SDK-bearing chunks (size on disk):');
  for (const f of sdkFiles) {
    const file = path.join(root, '.next', f.replace(/^\/_next\//, ''));
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      /* ignore */
    }
    console.log(`  ${f}  ${Math.round(size / 1024)} KB`);
  }
}

/**
 * Leaves the measurement somewhere `audit:supabase` can read it.
 *
 * Without this the source audit has to quote a number somebody typed, and a typed
 * number is wrong the first time a route changes — the previous one still named
 * `/verify-email`, which no longer exists. The report goes in `.next/` so it is a
 * build artifact, never a committed file, and it records what was measured as well
 * as the result: which routes, from which base URL, when.
 */
const reportPath = path.join(root, '.next', 'client-supabase-report.json');
try {
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        baseUrl,
        routesChecked: results.length,
        sdkRoutes: results.filter((r) => r.sdk > 0).map((r) => r.route).sort(),
        configRoutes: results.filter((r) => r.config > 0).map((r) => r.route).sort(),
        unmeasured: unmeasured.sort(),
        errors: results.filter((r) => r.error).map((r) => r.route),
      },
      null,
      2
    )}\n`
  );
  console.log(`\nwrote ${path.relative(root, reportPath).split(path.sep).join('/')}`);
} catch (error) {
  // Not worth failing the gate over: the gate is the exit status above.
  console.warn(`Could not write the audit report: ${error.message}`);
}

if ((dirty.length > 0 || coverageFailures.length > 0) && !process.env.ALLOW_DIRTY) process.exit(1);
