#!/usr/bin/env node
/**
 * Package the HK WordPress plugins into ZIPs a WordPress admin can upload.
 *
 *   npm run pack:plugins
 *
 * Why this exists: WordPress installs a plugin from a ZIP whose top level is the
 * plugin's own folder, and there is no REST route for uploading one (`/wp/v2/plugins`
 * is not available in all installs, never mind the credential to call it). So the
 * release artifact is built here, from the one tracked copy in `wordpress/`, and its
 * checksum is printed so a human uploading it can prove it is the file this repository
 * produced.
 *
 * The archive is written here rather than by `Compress-Archive` or the `zip` CLI,
 * because Compress-Archive writes **backslash** separators inside the archive. A Linux
 * host then unpacks the plugin as one file literally named
 * `himalayan-koh-storefront\himalayan-koh-storefront.php`: WordPress lists it, and every
 * activation answers "Plugin file does not exist." Writing the archive in Node removes
 * that trap and the platform branch with it.
 *
 * Two shape rules, both learned the hard way against a real site:
 *
 *   1. No wrapping folder. WordPress names the plugin's destination directory after the
 *      *uploaded filename*, then unpacks the archive inside it. A wrapping folder just
 *      adds a level, and `-1.5.0` in the filename becomes a version-named plugin folder.
 *   2. So the artifact is `deploy/<slug>.zip` with the plugin file at the archive root,
 *      which installs as `wp-content/plugins/<slug>/<slug>.php`.
 *
 * The versions come from each plugin's own header — never from this script — because a
 * ZIP that says one version while the plugin says another is how the wrong code ends up
 * active. Output goes to `deploy/` (gitignored: build artifacts, not source).
 *
 * READ-ONLY with respect to WordPress: nothing here talks to the site.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'deploy');

const PLUGINS = [
  { slug: 'himalayan-koh-storefront', file: 'wordpress/himalayan-koh-storefront.php' },
  { slug: 'himalayan-koh-leados', file: 'wordpress/himalayan-koh-leados.php' },
  // The B2B side: wholesale accounts, pricing, container maths and quotations.
  // Separate from the storefront plugin so a fault in the wholesale calculator
  // cannot take a shopper's wishlist with it.
  { slug: 'hk-wholesale', file: 'wordpress/hk-wholesale.php' },
  // Staging-only compatibility shim for the FarmAgrico theme's Store API fatal;
  // packaged alongside the real plugins so its artifact and checksum are built
  // the same way, and removed the same way once the theme is fixed.
  { slug: 'hk-store-api-compat', file: 'wordpress/hk-store-api-compat/hk-store-api-compat.php' },
  // Staging-only, marker-scoped cleanup tool. Packaged like the others so its
  // artifact and checksum are reproducible; it refuses to run on production and is
  // removed from staging once the QA rows are gone.
  { slug: 'hk-staging-cleanup', file: 'wordpress/hk-staging-cleanup/hk-staging-cleanup.php' },
];

/** The plugin's own header version, which is the only version that counts. */
function pluginVersion(source) {
  const match = source.match(/^\s*\*\s*Version:\s*(\S+)/m);
  if (!match) throw new Error('no Version header found');
  return match[1];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A stored/deflated ZIP with `/` separators. `entries` are paths relative to the
 * archive root plus their contents; the directory entry for each is implied by the
 * file paths, which is what WordPress's unzip expects.
 */
function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);

    local.push(header, nameBytes, deflated);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4); // version made by
    directory.writeUInt16LE(20, 6); // version needed
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(deflated.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(0, 38); // external attributes
    directory.writeUInt32LE(offset, 42);

    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + deflated.length;
  }

  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, centralBytes, end]);
}

/** Every entry must be forward-slash, flat, and named after the plugin file. */
function assertInstallable(zipPath, slug, expected) {
  const bytes = readFileSync(zipPath);
  const names = [];
  for (let i = 0; i < bytes.length - 30; i += 1) {
    if (bytes.readUInt32LE(i) !== 0x04034b50) continue;
    const nameLength = bytes.readUInt16LE(i + 26);
    names.push(bytes.subarray(i + 30, i + 30 + nameLength).toString('utf8'));
    i += 29 + nameLength;
  }
  if (names.some((name) => name.includes('\\'))) {
    throw new Error(`${zipPath} contains backslash separators — WordPress would not unpack it`);
  }
  if (names.some((name) => name.includes('/'))) {
    throw new Error(`${zipPath} wraps its contents in a folder — WordPress already names that folder after the ZIP (${names[0]})`);
  }
  if (!names.includes(expected)) {
    throw new Error(`${zipPath} does not contain ${expected}`);
  }
  return names;
}

mkdirSync(OUT, { recursive: true });

let failed = 0;

for (const plugin of PLUGINS) {
  const source = join(ROOT, plugin.file);
  if (!existsSync(source)) {
    console.error(`  ${plugin.slug}: ${plugin.file} is missing`);
    failed += 1;
    continue;
  }

  let version;
  try {
    version = pluginVersion(readFileSync(source, 'utf8'));
  } catch (error) {
    console.error(`  ${plugin.slug}: could not read the plugin version (${error.message})`);
    failed += 1;
    continue;
  }

  const inside = plugin.file.split('/').pop();
  const entries = [[inside, readFileSync(source)]];

  // The filename is load-bearing: WordPress installs this into `plugins/<basename>/`.
  const zipPath = join(OUT, `${plugin.slug}.zip`);
  rmSync(zipPath, { force: true });
  writeFileSync(zipPath, buildZip(entries));

  let names;
  try {
    names = assertInstallable(zipPath, plugin.slug, inside);
  } catch (error) {
    console.error(`  ${plugin.slug}: ${error.message}`);
    failed += 1;
    continue;
  }

  const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  console.log(`${plugin.slug}.zip  (version ${version})`);
  console.log(`  file:     deploy/${plugin.slug}.zip`);
  console.log(`  installs: wp-content/plugins/${plugin.slug}/${inside}`);
  console.log(`  bytes:    ${statSync(zipPath).size}`);
  console.log(`  entries:  ${names.join(', ')}`);
  console.log(`  sha256:   ${sha256}`);
}

process.exit(failed ? 1 : 0);
