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
 * The versions come from each plugin's own header — never from this script — because a
 * ZIP that says one version while the plugin says another is how the wrong code ends up
 * active. Output goes to `deploy/` (gitignored: build artifacts, not source).
 *
 * READ-ONLY with respect to WordPress: nothing here talks to the site.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'deploy');

const PLUGINS = [
  { slug: 'himalayan-koh-storefront', file: 'wordpress/himalayan-koh-storefront.php' },
  { slug: 'himalayan-koh-leados', file: 'wordpress/himalayan-koh-leados.php' },
];

/** The plugin's own header version, which is the only version that counts. */
function pluginVersion(source) {
  const match = source.match(/^\s*\*\s*Version:\s*(\S+)/m);
  if (!match) throw new Error('no Version header found');
  return match[1];
}

function zip(from, to) {
  // PowerShell's Compress-Archive on Windows, `zip` elsewhere. Both put the named
  // directory at the archive root, which is what WordPress requires.
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${from}' -DestinationPath '${to}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    return;
  }
  execFileSync('zip', ['-qr', to, from], { stdio: 'inherit', cwd: dirname(from) });
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

  const php = readFileSync(source, 'utf8');
  let version;
  try {
    version = pluginVersion(php);
  } catch (error) {
    console.error(`  ${plugin.slug}: could not read the plugin version (${error.message})`);
    failed += 1;
    continue;
  }

  // Stage the plugin folder exactly as WordPress will unpack it.
  const stage = join(OUT, plugin.slug);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  copyFileSync(source, join(stage, plugin.file.split('/').pop()));

  const zipPath = join(OUT, `${plugin.slug}-${version}.zip`);
  rmSync(zipPath, { force: true });
  zip(stage, zipPath);

  const bytes = readFileSync(zipPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  console.log(`${plugin.slug}-${version}.zip`);
  console.log(`  file:   deploy/${plugin.slug}-${version}.zip`);
  console.log(`  bytes:  ${statSync(zipPath).size}`);
  console.log(`  sha256: ${sha256}`);
}

process.exit(failed ? 1 : 0);
