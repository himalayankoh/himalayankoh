#!/usr/bin/env node
/**
 * Write a timestamped marker after a successful `npm run build`.
 *
 * Doctor's build-status check reads this marker instead of `.next/BUILD_ID`,
 * because the Next.js dev server rewrites `.next` (wiping BUILD_ID) whenever
 * it restarts, which made the check report "no previous build" on dev
 * machines even though a production build had succeeded.
 *
 * Runs automatically via the `postbuild` npm script.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = join(ROOT, '.build-marker');

const stamp = new Date().toISOString();
await writeFile(MARKER, stamp, 'utf8');
console.log(`Build marker written: ${stamp}`);
