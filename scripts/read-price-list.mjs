#!/usr/bin/env node
/**
 * Reads a spreadsheet the owner sent, without adding a dependency.
 *
 * An `.xlsx` is a zip of XML, and this reads it as one: `unzip` extracts it into a
 * temporary directory, the shared-string table is indexed, and each sheet's cells are
 * resolved to values. That is deliberately not a general spreadsheet library — it is a
 * reader for a *price list*, so it prints sheets as rows and stops. Numbers, dates and
 * formulas are handled the way a price list uses them; anything exotic is shown as the
 * raw cell so nothing is silently dropped.
 *
 * Usage:
 *   node scripts/read-price-list.mjs "/path/to/file.xlsx" [--sheet N] [--rows 200]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((value) => !value.startsWith('--'));
const limitFlag = args.indexOf('--rows');
const limit = limitFlag >= 0 ? Number(args[limitFlag + 1]) : 400;
const sheetFlag = args.indexOf('--sheet');
const onlySheet = sheetFlag >= 0 ? Number(args[sheetFlag + 1]) : 0;

if (!file || !existsSync(file)) {
  console.error('Usage: node scripts/read-price-list.mjs "/path/to/file.xlsx" [--rows N] [--sheet N]');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'xlsx-'));
try {
  execFileSync('unzip', ['-o', file, '-d', work], { stdio: 'ignore' });
} catch {
  console.error('unzip is required to read an .xlsx (it is a zip of XML).');
  rmSync(work, { recursive: true, force: true });
  process.exit(1);
}

const read = (path) => {
  try {
    return readFileSync(join(work, path), 'utf8');
  } catch {
    return '';
  }
};

/** The shared string table: `<si>` entries, each possibly split into runs. */
function sharedStrings() {
  const xml = read('xl/sharedStrings.xml');
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => decode(part[1]))
      .join('')
  );
}

function decode(value) {
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const strings = sharedStrings();

const workbook = read('xl/workbook.xml');
const sheetNames = [...workbook.matchAll(/<sheet[^>]*name="([^"]+)"/g)].map((match) => decode(match[1]));

/** Column letters to a zero-based index, so `AA` is 26 rather than NaN. */
function columnIndex(reference) {
  const letters = (reference.match(/^[A-Z]+/) || [''])[0];
  let index = 0;
  for (const character of letters) index = index * 26 + (character.charCodeAt(0) - 64);
  return index - 1;
}

const sheets = sheetNames.length ? sheetNames : ['Sheet1'];
console.log(`File: ${file}`);
console.log(`Sheets: ${sheets.map((name, index) => `${index + 1}. ${name}`).join('  |  ')}\n`);

for (const [index, name] of sheets.entries()) {
  if (onlySheet && index + 1 !== onlySheet) continue;
  const xml = read(`xl/worksheets/sheet${index + 1}.xml`);
  if (!xml) {
    console.log(`--- sheet ${index + 1}: ${name} — not readable ---`);
    continue;
  }

  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\s+r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = cellMatch[1];
      const attributes = cellMatch[2];
      const body = cellMatch[3];
      const type = (attributes.match(/t="([^"]+)"/) || [])[1] || 'n';
      let value = '';
      if (type === 's') {
        const sharedIndex = Number((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1]);
        value = strings[sharedIndex] ?? '';
      } else if (type === 'inlineStr') {
        value = decode(body);
      } else {
        value = decode((body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      }
      cells[columnIndex(reference)] = value;
    }
    if (cells.some((cell) => String(cell ?? '').trim())) rows.push({ row: Number(rowMatch[1]), cells });
    if (rows.length >= limit) break;
  }

  console.log(`--- sheet ${index + 1}: ${name} (${rows.length} row(s) shown) ---`);
  for (const entry of rows) {
    const cells = entry.cells.map((cell) => (cell === undefined ? '' : String(cell)));
    console.log(`${String(entry.row).padStart(4)} | ${cells.join(' | ')}`);
  }
  console.log('');
}

rmSync(work, { recursive: true, force: true });
