#!/usr/bin/env node
/**
 * One-time migration: download the images that still live on the old
 * WordPress site and write them into public/images/legacy/ under stable names.
 *
 *   node scripts/fetch-legacy-images.mjs
 *
 * Run this while himalayankoh.com is still up, then commit the downloaded
 * files. After that the site serves them from its own domain and WordPress can
 * be shut down. The script is idempotent — files that already exist are left
 * alone unless you pass --force.
 *
 * The source URLs mirror the `wordpress` fields in
 * src/lib/images/legacyAssets.ts. scripts/check-legacy-images.mjs verifies the
 * two stay in sync, and runs as part of `npm run build`.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'images', 'legacy');
const WP_BASE = 'https://himalayankoh.com/wp-content/uploads';

/**
 * Original WordPress path -> filename to save it as.
 *
 * This list mirrors `src/lib/images/legacyAssets.ts` exactly, and
 * scripts/check-legacy-images.mjs fails the build if the two drift. It is kept
 * to the images the approved public pages actually render: the homepage hero
 * uses the horse shot, so it belongs here, and the paddock/banner/cattle shots
 * that nothing references do not.
 */
const IMAGES = [
  ['2017/10/bowl-of-salt.jpg', 'bowl-of-salt.jpg'],
  ['2017/10/slat-licking-horse.jpg', 'horse-licking-salt.jpg'],
  ['2025/07/6-lbs-pouche.webp', 'salt-pouch-6lb.webp'],
  ['2024/08/WhatsApp-Image-2024-08-02-at-11.31.07-PM-500x500.jpeg', 'pink-salt-16oz-jar.jpg'],
  ['2023/08/S6-600x450.jpg', 'salt-rock-bag.jpg'],
];

const force = process.argv.includes('--force');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(sourcePath, filename) {
  const target = join(OUT_DIR, filename);

  if (!force && (await exists(target))) {
    return { filename, status: 'skipped', detail: 'already present' };
  }

  const url = `${WP_BASE}/${sourcePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    return { filename, status: 'failed', detail: `HTTP ${response.status}` };
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) {
    return { filename, status: 'failed', detail: 'empty response' };
  }

  await writeFile(target, body);
  return { filename, status: 'saved', detail: `${(body.length / 1024).toFixed(0)} kB` };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const results = [];
  for (const [sourcePath, filename] of IMAGES) {
    try {
      results.push(await download(sourcePath, filename));
    } catch (error) {
      results.push({ filename, status: 'failed', detail: error.message });
    }
  }

  for (const { filename, status, detail } of results) {
    process.stdout.write(`${status.padEnd(7)} ${filename.padEnd(32)} ${detail}\n`);
  }

  const failed = results.filter((result) => result.status === 'failed');
  if (failed.length > 0) {
    process.stdout.write(
      `\n${failed.length} of ${IMAGES.length} failed. If himalayankoh.com is already down, ` +
        `export the originals from the WordPress media library and save them into\n` +
        `public/images/legacy/ using the filenames above.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`\nAll ${IMAGES.length} images are in public/images/legacy/. Commit them.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
