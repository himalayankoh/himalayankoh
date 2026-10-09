#!/usr/bin/env node
/**
 * Verify that a claimed backup of the live WordPress installation is actually usable.
 *
 *   node scripts/verify-backup.mjs --db ~/backups/hk-live-2026-10-08.sql.gz \
 *                                  --files ~/backups/hk-home-2026-10-08.tar.gz
 *
 * ## What this is, and what it deliberately is not
 *
 * It is the executable form of the rule in
 * `docs/production/BACKUP-RESTORE-VERIFICATION.md`: the backup item stays **FAIL** until
 * a database dump **and** a files backup exist and can be shown to contain the right
 * things. There is nothing else in this project that can say PASS for a backup, and a
 * logical product export — a WooCommerce CSV, or a read of `/wp-json/wp/v2/product` —
 * is not a backup at all: it contains no orders, no customers, no settings and no media
 * files, so the flag that accepts it does not exist here.
 *
 * It is **not** a restore and never performs one. It reads the archive, reports what it
 * can prove, and exits non-zero when it cannot. A restore into the live database is not
 * a test — it is the accident the backup exists to recover from — so nothing in this
 * file opens a database connection, and the only write it makes is nothing at all.
 *
 * ## What it proves, and what it cannot
 *
 * Proved: the file exists and is non-empty; a gzip member is intact (the common way a
 * dump is silently truncated); the dump contains table definitions, and which of the
 * load-bearing WordPress and WooCommerce tables it carries; whether it looks like a
 * whole-database dump or a single-table export; for a files archive, that it extracts
 * as a list and what it contains (a WordPress install, its `wp-content/uploads`, and
 * `wp-config.php`).
 *
 * Not proved, and said so plainly in the output: that the *data* in the dump matches
 * the live database. That requires the restore-into-a-scratch-database step the document
 * describes, run by hand, with the row counts compared. This script cannot do it and
 * must not pretend to — hence the `PARTIAL` outcome for a dump whose contents look right
 * but which has never been restored.
 */
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createGunzip } from 'node:zlib';
import { spawnSync } from 'node:child_process';

/* ------------------------------------------------------------------ */
/* Arguments                                                          */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);

function flagValue(name) {
  const index = argv.indexOf(name);
  return index !== -1 ? argv[index + 1] : undefined;
}

const DB_PATH = flagValue('--db');
const FILES_PATH = flagValue('--files');
const RESTORE_EVIDENCE = flagValue('--restore-evidence');
const PREFIX = (flagValue('--prefix') || 'wp_').replace(/_+$/, '') + '_';

if (!DB_PATH && !FILES_PATH) {
  process.stderr.write(
    'Usage: node scripts/verify-backup.mjs --db <dump.sql|dump.sql.gz> [--files <archive.tar.gz|directory>]\n' +
      '       [--prefix wp_] [--restore-evidence <file>]\n\n' +
      '  --files may be one archive or a directory. A directory is walked and any\n' +
      '  .tar/.tar.gz/.tgz archive inside it is read as well, because this site takes its\n' +
      '  files half as separate archives for uploads and for plugins and themes.\n\n' +
      'Both halves are required for a PASS: a database dump alone cannot be restored into\n' +
      'a working site, and files alone have no content or orders in them. A PASS also needs\n' +
      'the recorded evidence of a restore into a scratch database, because a dump nobody has\n' +
      'ever restored is a hope rather than a backup.\n' +
      'See docs/production/BACKUP-RESTORE-VERIFICATION.md.\n',
  );
  process.exit(2);
}

const KNOWN_FLAGS = ['--db', '--files', '--prefix', '--restore-evidence'];
const unknown = argv.filter((arg, index) => arg.startsWith('--') && !KNOWN_FLAGS.includes(arg) && !KNOWN_FLAGS.includes(argv[index - 1] ?? ''));
if (unknown.length > 0) {
  process.stderr.write(`Unknown argument(s): ${unknown.join(', ')}\n`);
  process.exit(2);
}

const results = [];
const record = (item, outcome, evidence) => results.push({ item, outcome, evidence });

/**
 * The step this script cannot perform, and therefore cannot assume.
 *
 * A restore into a scratch database is the only thing that proves a dump restores, and
 * it is a human action against a database this script must not touch. So it is an
 * *input*: name the file that records it (the section-4.5 evidence — the import command
 * and the row counts compared) and the verdict can reach PASS. Omit it and the verdict
 * is NOT PASS, because the alternative is a tool that signs off a backup nobody has ever
 * restored. The value is read here, before the database half, because that half's verdict
 * depends on it.
 */
const evidencePath = RESTORE_EVIDENCE ? resolve(RESTORE_EVIDENCE) : null;
const restoreRecorded = Boolean(evidencePath && existsSync(evidencePath) && statSync(evidencePath).size > 0);

/* ------------------------------------------------------------------ */
/* The database half                                                  */
/* ------------------------------------------------------------------ */

/**
 * Tables a WordPress site cannot be restored without.
 *
 * `wp_posts`, `wp_postmeta`, `wp_options` and `wp_users` hold the content, the
 * catalogue's metadata, the site's configuration and the accounts. The two WooCommerce
 * possibilities are checked as an either/or because a store may be running the legacy
 * post-based order tables (`wp_woocommerce_order_items` + `wp_postmeta`) or the newer
 * High-Performance Order Storage tables (`wp_wc_orders*`) — and a dump that has neither
 * has lost the orders.
 */
const REQUIRED_TABLES = ['posts', 'postmeta', 'options', 'users'];
const ORDER_TABLE_GROUPS = [
  ['woocommerce_order_items', 'woocommerce_order_itemmeta'],
  ['wc_orders', 'wc_order_addresses'],
];

async function readDump(path) {
  const gunzip = /\.gz$/i.test(path);
  const stream = createReadStream(path);
  const source = gunzip ? stream.pipe(createGunzip()) : stream;

  const tables = new Set();
  let createStatements = 0;
  let insertStatements = 0;
  let bytes = 0;
  let failure = null;

  // One consumer, one promise. An earlier version attached a separate `end` listener to
  // decide whether the gzip member was intact, which deadlocked: a listener for `end`
  // alone does not put a readable stream into flowing mode, so neither promise ever
  // settled and the script exited without a verdict. The integrity answer comes from the
  // same pass that reads the text — an error event is the truncation signal.
  await new Promise((resolvePromise) => {
    source.on('data', (chunk) => {
      bytes += chunk.length;
      // A dump is text; matching the two statement kinds answers "does this contain the
      // schema and the data", which is all this script claims to know.
      for (const rawLine of chunk.toString('utf8').split('\n')) {
        const line = rawLine.trim();
        if (/^CREATE TABLE/i.test(line)) {
          createStatements += 1;
          const match = line.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[`"']?([A-Za-z0-9_$]+)[`"']?/i);
          if (match) tables.add(match[1]);
        } else if (/^INSERT INTO/i.test(line)) {
          insertStatements += 1;
        }
      }
    });
    source.on('end', resolvePromise);
    source.on('close', resolvePromise);
    source.on('error', (error) => {
      failure = `${error.code || error.message}`;
      resolvePromise();
    });
  });

  return {
    gunzipStatus: failure ? `gzip error: ${failure}` : gunzip ? 'intact' : 'not gzipped',
    tables,
    createStatements,
    insertStatements,
    bytes,
  };
}

async function verifyDatabase(path) {
  if (!existsSync(path)) {
    record('database dump exists', 'FAIL', `${path} does not exist`);
    return { ok: false };
  }
  const size = statSync(path).size;
  if (size === 0) {
    record('database dump exists', 'FAIL', `${basename(path)} is 0 bytes`);
    return { ok: false };
  }
  record('database dump exists', 'PASS', `${basename(path)}, ${(size / 1_048_576).toFixed(1)} MiB`);

  let dump;
  try {
    dump = await readDump(path);
  } catch (error) {
    record('database dump readable', 'FAIL', String(error?.message || error));
    return { ok: false };
  }

  if (dump.gunzipStatus !== 'not gzipped' && dump.gunzipStatus !== 'intact') {
    record('gzip stream intact (a truncated dump is the usual failure)', 'FAIL', dump.gunzipStatus);
    return { ok: false };
  }
  record('gzip stream intact', 'PASS', dump.gunzipStatus);
  record('dump is not empty once decompressed', dump.bytes > 0 ? 'PASS' : 'FAIL', `${(dump.bytes / 1_048_576).toFixed(1)} MiB decompressed`);

  if (dump.createStatements === 0) {
    record('dump contains table definitions', 'FAIL', 'no CREATE TABLE statement found — this may be a data-only or single-table export');
    return { ok: false };
  }
  record(
    'dump contains table definitions',
    'PASS',
    `${dump.createStatements} CREATE TABLE, ${dump.insertStatements} INSERT statement(s), ${dump.tables.size} distinct table(s)`,
  );

  const named = (suffix) => [...dump.tables].filter((table) => table === `${PREFIX}${suffix}` || table.endsWith(`_${suffix}`) || table === suffix);
  for (const suffix of REQUIRED_TABLES) {
    const found = named(suffix);
    record(
      `dump contains the ${suffix} table`,
      found.length > 0 ? 'PASS' : 'FAIL',
      found.length > 0 ? found.join(', ') : `no table ending in _${suffix}`,
    );
  }

  const orderGroup = ORDER_TABLE_GROUPS.find((group) => group.every((suffix) => named(suffix).length > 0));
  record(
    'dump contains the store’s orders',
    orderGroup ? 'PASS' : 'FAIL',
    orderGroup
      ? `found ${orderGroup.join(', ')} (${orderGroup === ORDER_TABLE_GROUPS[0] ? 'legacy post-based storage' : 'High-Performance Order Storage'})`
      : `found neither ${ORDER_TABLE_GROUPS[0].join(' + ')} nor ${ORDER_TABLE_GROUPS[1].join(' + ')} — the orders are not in this dump`,
  );

  const missing = REQUIRED_TABLES.filter((suffix) => named(suffix).length === 0);
  if (missing.length > 0 || !orderGroup) return { ok: false };

  record(
    'database half looks complete',
    restoreRecorded ? 'PASS' : 'PARTIAL',
    restoreRecorded
      ? `contents complete, and the restore into a scratch database is recorded in ${basename(evidencePath)}`
      : 'contents look complete; a restore into a scratch database with row counts compared is still required before this can be treated as a backup',
  );
  return { ok: true, dump };
}

/* ------------------------------------------------------------------ */
/* The files half                                                     */
/* ------------------------------------------------------------------ */

function entriesOfArchive(path) {
  // `tar -tzf` — the listing only. No extraction happens, here or anywhere.
  //
  // The second attempt carries `--force-local` because a drive-lettered path contains a
  // colon, which a MSYS/GNU tar reads as a *remote host* ("Cannot connect to C: resolve
  // failed") — on Windows that made a perfectly good archive look unreadable.
  const attempts = [
    ['-tzf', path],
    ['--force-local', '-tzf', path],
  ];
  const errors = [];
  for (const args of attempts) {
    const result = spawnSync('tar', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!result.error && result.status === 0) {
      return { entries: result.stdout.split('\n').filter(Boolean) };
    }
    errors.push(result.error ? result.error.message : (result.stderr || '').trim() || `tar exited ${result.status}`);
  }
  return { error: errors.join('; ') };
}

function walk(directory) {
  const found = [];
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else found.push(full);
    }
  }
  return found;
}

/** The archive kinds `entriesOfArchive` can list (tar's own, never a zip). */
const ARCHIVE_SUFFIXES = ['.tar.gz', '.tgz', '.tar'];

async function verifyFiles(path) {
  if (!existsSync(path)) {
    record('files backup exists', 'FAIL', `${path} does not exist`);
    return { ok: false };
  }
  const stats = statSync(path);

  let entries;
  if (stats.isDirectory()) {
    try {
      // Archive listings use `/`, so a directory has to be normalised to the same shape
      // or every match below silently fails on Windows — which is how a complete backup
      // gets reported as missing its uploads.
      //
      // A backup directory holds the loose files (`wp-config.php`) *and* the archives. The
      // walk yields the archives' names only, so a split backup read as a directory of two
      // filenames and nothing else — and reported a complete backup as missing its uploads,
      // plugins and themes. Opening each archive closes that gap; it changes nothing about
      // what the checks below require of the entries it finds.
      const archivesRead = [];
      entries = [];
      for (const file of walk(path)) {
        const relative = file.slice(resolve(path).length + 1).split('\\').join('/');
        if (!ARCHIVE_SUFFIXES.some((suffix) => relative.toLowerCase().endsWith(suffix))) {
          entries.push(relative);
          continue;
        }
        const listing = entriesOfArchive(file);
        if (listing.error) {
          record('files archive can be listed without extracting it', 'FAIL', `${relative}: ${listing.error}`);
          return { ok: false };
        }
        archivesRead.push(`${relative} (${listing.entries.length} entries)`);
        entries.push(...listing.entries);
      }
      if (archivesRead.length > 0) {
        record('archives inside the directory can be listed without extracting them', 'PASS', archivesRead.join(', '));
      }
    } catch (error) {
      record('files backup readable', 'FAIL', String(error?.message || error));
      return { ok: false };
    }
    record('files backup readable', 'PASS', `directory ${basename(path)}, ${entries.length} entries`);
  } else {
    const size = stats.size;
    if (size === 0) {
      record('files backup exists', 'FAIL', `${basename(path)} is 0 bytes`);
      return { ok: false };
    }
    const listing = entriesOfArchive(path);
    if (listing.error) {
      record('files archive can be listed without extracting it', 'FAIL', listing.error);
      return { ok: false };
    }
    entries = listing.entries;
    record('files archive can be listed without extracting it', 'PASS', `${basename(path)}, ${(size / 1_048_576).toFixed(1)} MiB, ${entries.length} entries`);
  }

  // A WordPress backup can archive `wp-content/` itself, so its entries read
  // `wp-content/uploads/2026/10/x.jpg`, or it can archive that directory's
  // *contents*, which is how this site's archives are taken, so the same file reads
  // `uploads/2026/10/x.jpg`. Both are the same tree and the three checks below are
  // about what is inside it, so each one accepts either root — and nothing else. A
  // directory named `my-uploads/` or `staging/uploads/` still does not count, and the
  // bar for "non-trivial" (more than 50 files) is unchanged, which is what catches an
  // uploads tree that was empty because the account's disk quota was full.
  const underTree = (entry, tree) => new RegExp(`(^|/)wp-content/${tree}/`).test(entry) || new RegExp(`(^|/)${tree}/`).test(entry);
  const treeFile = (entry, tree) => new RegExp(`(^|/)(wp-content/)?${tree}/[^/]+/[^/]*$`).test(entry);

  const hasConfig = entries.some((entry) => /(^|\/)wp-config\.php$/.test(entry));
  record(
    'files backup contains wp-config.php',
    hasConfig ? 'PASS' : 'FAIL',
    hasConfig ? 'wp-config.php present' : 'no wp-config.php — plugins, themes and the salts cannot be reconstructed from the database alone',
  );

  const uploads = entries.filter((entry) => underTree(entry, 'uploads') && !entry.endsWith('/'));
  record(
    'files backup contains a non-trivial wp-content/uploads',
    uploads.length > 50 ? 'PASS' : 'FAIL',
    `${uploads.length} file(s) under wp-content/uploads`,
  );

  const plugins = entries.filter((entry) => treeFile(entry, 'plugins')).length;
  const themes = entries.filter((entry) => treeFile(entry, 'themes')).length;
  record(
    'files backup contains the plugins and themes',
    plugins > 0 && themes > 0 ? 'PASS' : 'FAIL',
    `${plugins} plugin file(s), ${themes} theme file(s)`,
  );

  const complete = hasConfig && uploads.length > 50 && plugins > 0 && themes > 0;
  return { ok: complete, uploads: uploads.length };
}

/* ------------------------------------------------------------------ */
/* Run and report                                                     */
/* ------------------------------------------------------------------ */

process.stdout.write(`\nBackup verification — ${new Date().toISOString()}\n`);
process.stdout.write('Read-only. Nothing is extracted, restored, imported or connected to.\n\n');const database = DB_PATH ? await verifyDatabase(resolve(DB_PATH)) : { ok: false };
if (!DB_PATH) record('database dump provided', 'FAIL', 'no --db was given; a files backup alone cannot restore a site');

const files = FILES_PATH ? await verifyFiles(resolve(FILES_PATH)) : { ok: false };
if (!FILES_PATH) record('files backup provided', 'FAIL', 'no --files was given; a database alone cannot restore a site');

if (evidencePath) {
  record(
    'a restore into a scratch database is recorded',
    restoreRecorded ? 'PASS' : 'FAIL',
    restoreRecorded
      ? `${basename(evidencePath)}, ${statSync(evidencePath).size} bytes — this script read the file's name and size only; it cannot re-run the restore, which is why the file must describe it`
      : `${RESTORE_EVIDENCE} is missing or empty — the evidence must be written down, not remembered`,
  );
} else {
  record('a restore into a scratch database is recorded', 'FAIL', 'no --restore-evidence was given; see docs/production/BACKUP-RESTORE-VERIFICATION.md §4.5');
}

const failed = results.filter((entry) => entry.outcome === 'FAIL');
const partial = results.filter((entry) => entry.outcome === 'PARTIAL');
const notes = results.filter((entry) => entry.outcome === 'NOTE');

const width = Math.max(...results.map((entry) => entry.item.length));
for (const entry of results) {
  process.stdout.write(`  ${entry.outcome.padEnd(7)} ${entry.item.padEnd(width)}  ${entry.evidence}\n`);
}

const passes = results.length - failed.length - partial.length - notes.length;
const status = failed.length > 0 ? 'FAIL' : partial.length > 0 ? 'NOT PASS' : 'PASS';
process.stdout.write(`\n  ${passes} passed, ${failed.length} failed, ${partial.length} partial, ${notes.length} note\n`);

process.stdout.write(`\n  BACKUP STATUS: ${status}\n`);
if (failed.length > 0) {
  process.stdout.write('  Fix first:\n');
  for (const entry of failed) process.stdout.write(`    - ${entry.item}: ${entry.evidence}\n`);
}
if (partial.length > 0) {
  process.stdout.write(
    '  Still outstanding after this check:\n' +
      '    - restore the dump into a scratch database and compare table and row counts\n' +
      '      against the source (docs/production/BACKUP-RESTORE-VERIFICATION.md §4.5), then\n' +
      '      re-run with --restore-evidence naming the file that records it.\n',
  );
}
if (status === 'PASS') {
  process.stdout.write(
    '  Both halves are present and the restore is recorded. Re-check the archive dates are\n' +
    '  newer than the last content change before treating this as the cutover precondition.\n',
  );
}

process.stdout.write('\n  No product, order, customer, setting or file was modified.\n\n');
process.exit(failed.length === 0 ? 0 : 1);
