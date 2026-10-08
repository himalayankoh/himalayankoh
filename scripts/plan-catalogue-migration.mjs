#!/usr/bin/env node
/**
 * Plan the catalogue migration — a strict, read-only dry run.
 *
 *   node scripts/plan-catalogue-migration.mjs
 *   node scripts/plan-catalogue-migration.mjs --out docs/production/CATALOGUE-MIGRATION-MANIFEST.json
 *
 * ## What this is
 *
 * `compare-catalogues.mjs` answers "do the two catalogues differ and where". This
 * answers the next question, which is the one a migration actually needs: **for each
 * product, is this a replacement, an addition, a duplicate, or a conflict — and which
 * of those can be decided automatically?** It reads the same four sources (through the
 * same reader) and writes a manifest with the eight diff classes the plan calls for,
 * keyed on **SKU** and never on database id.
 *
 * Two artefacts, both reviewable before anything is touched:
 *
 *   docs/production/CATALOGUE-MIGRATION-MANIFEST.json   machine-readable, schemaVersion 1
 *   docs/production/CATALOGUE-MIGRATION-MANIFEST.md     the same thing for a human
 *
 * ## Read-only, structurally
 *
 * Every request is a GET. There is no code path here that writes anything to
 * WordPress, WooCommerce, the storefront or Cloudflare — not a disabled branch, not a
 * flag-gated one, but no path at all. `--apply`, `--import`, `--sync` and the rest are
 * therefore **refused with a non-zero exit**, because a write imported into this tool
 * by habit is exactly the failure this migration cannot afford:
 *
 *   $ node scripts/plan-catalogue-migration.mjs --apply
 *   --apply is refused. This tool is a dry run with no write path …
 *
 * Any future write needs its own tool and a separate, explicit owner approval
 * (docs/production/FINAL-GPT6-HANDOFF.md), with the backup verified first.
 *
 * ## What it reports honestly
 *
 * The live apex does not accept this project's WooCommerce key pair, so it exposes no
 * SKU, price or stock. Measured on 2026-10-08: `GET /wp-json/wc/v3/products` on the
 * apex returns HTTP 401 for the configured pair, while the public WP REST endpoint
 * returns all 13 published products. That is a limit of what is *readable*, not a
 * finding about the catalogue, and the manifest says so in three places rather than
 * quietly reporting an empty match list: `keying.blockers`, a `notComparable` entry
 * per pair per field, and the "Why keyed matching is blocked" section of the report.
 *
 * The manifest becomes fully decidable the moment a read-only key pair exists on the
 * apex — re-run it and the SKU-keyed classes fill in — and until then the suggested
 * pairs are labelled "owner approval required" everywhere they appear.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalogueSources } from './lib/catalogueSources.mjs';
import { buildMigrationManifest, findWriteFlag, renderManifestMarkdown } from './lib/catalogueDiff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* Arguments                                                          */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);

const refused = findWriteFlag(argv);
if (refused) {
  process.stderr.write(
    `${refused} is refused.\n\n` +
      'This tool is a read-only dry run and has no write path: it reads four catalogues\n' +
      'with GET requests and writes one report about them. Creating, updating, publishing\n' +
      'or deleting a product is a separate operation that needs its own tool, a verified\n' +
      'database and files backup, and an explicit owner approval — see\n' +
      'docs/production/FINAL-GPT6-HANDOFF.md and\n' +
      'docs/production/BACKUP-RESTORE-VERIFICATION.md.\n\n' +
      'Nothing was changed.\n',
  );
  process.exit(1);
}

const unknown = argv.filter((arg) => arg.startsWith('--') && !['--out', '--md', '--quiet'].includes(arg.split('=')[0]));
if (unknown.length > 0) {
  process.stderr.write(`Unknown argument(s): ${unknown.join(', ')}\nUsage: node scripts/plan-catalogue-migration.mjs [--out <json path>] [--md <md path>] [--quiet]\n`);
  process.exit(1);
}

function flagValue(name, fallback) {
  const index = argv.indexOf(name);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  return fallback;
}

/**
 * A destination path, absolute or relative to the project root.
 *
 * `join(ROOT, value)` alone mangles any absolute path — on Windows an absolute
 * `--out C:/somewhere/manifest.json` became `<root>/C:/somewhere/manifest.json`, and the
 * failure surfaced as an `ENOENT` from `mkdir` naming a directory nobody typed. Writing the
 * artefact somewhere else (a scratch path for a before/after comparison, most obviously) is
 * a legitimate use of `--out`, so an absolute path is used as given.
 */
const outPath = (value) => (isAbsolute(value) ? value : join(ROOT, value));

/** How a path is shown to a human: project-relative when it is inside, absolute when it is not. */
const displayPath = (value) => {
  const rel = relative(ROOT, value).split('\\').join('/');
  return rel.startsWith('../') ? value.split('\\').join('/') : rel;
};

const OUT_JSON = outPath(flagValue('--out', 'docs/production/CATALOGUE-MIGRATION-MANIFEST.json'));
const OUT_MD = outPath(flagValue('--md', 'docs/production/CATALOGUE-MIGRATION-MANIFEST.md'));
const QUIET = argv.includes('--quiet');

/* ------------------------------------------------------------------ */
/* Run                                                                */
/* ------------------------------------------------------------------ */

const sources = await readCatalogueSources();
const manifest = buildMigrationManifest(sources, { generatedAt: new Date().toISOString() });

mkdirSync(dirname(OUT_JSON), { recursive: true });
mkdirSync(dirname(OUT_MD), { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(
  OUT_MD,
  renderManifestMarkdown(manifest, {
    jsonPath: displayPath(OUT_JSON),
  }),
  'utf8',
);

if (!QUIET) {
  const s = manifest.summary;
  const w = (line) => process.stdout.write(`${line}\n`);
  w('');
  w('Catalogue migration manifest — dry run, no writes');
  w('');
  w(`  live apex (published)        ${s.livePublished}`);
  w(`  curated (staging)            ${s.curatedTotal}`);
  w(`  served (storefront)          ${s.servedTotal}`);
  w('');
  w(`  keyed on SKU                 ${s.skuMatchingPossible ? 'yes' : 'NO — the live apex exposes no SKU'}`);
  w(`  exact SKU matches            ${s.exactSkuMatches}`);
  w(`  possible (owner approval)    ${s.possibleMatchesRequiringOwnerApproval}`);
  w(`  missing production products  ${s.missingProductionProducts}`);
  w(`  products requiring creation  ${s.productsRequiringCreation}`);
  w(`  duplicate SKUs               ${s.duplicateSkus}`);
  w(`  conflicting products         ${s.conflictingProducts}`);
  w(`  price differences            ${s.priceDifferences}`);
  w(`  stock differences            ${s.stockDifferences}`);
  w(`  image differences            ${s.imageDifferences}`);
  w(`  category differences         ${s.categoryDifferences}`);
  w(`  not comparable               ${s.notComparable}`);
  w('');
  if (!s.skuMatchingPossible) {
    for (const blocker of manifest.keying.blockers) w(`  blocker: ${blocker}`);
    w('');
  }
  w(`  written to                   ${displayPath(OUT_JSON)}`);
  w(`                               ${displayPath(OUT_MD)}`);
  w('');
  w('  Nothing was created, updated, published or deleted. Any write needs separate owner approval.');
  w('');
}
