// ============================================================================
// Product packaging form — field coverage
//
// The owner must be able to enter every packaging field the engine reads, and
// the form must send them all and read them all back on reload. The form is a
// client component that renders only behind an admin session, so the contract
// is asserted at the source level: the form's field list must cover the engine's
// required set, and both directions of the form must reference the same list.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source =
  readFileSync(fileURLToPath(new URL('./ConfigPanels.tsx', import.meta.url)), 'utf8') +
  '\n' +
  readFileSync(fileURLToPath(new URL('../../../lib/wholesale/packagingFields.ts', import.meta.url)), 'utf8');

/** Every field `mapping.ts` reads for a Complete packaging profile, plus the optional enrichments. */
const REQUIRED_KEYS = [
  'cartonQty',
  'packagedUnitWeightKg',
  'cartonLengthCm',
  'cartonWidthCm',
  'cartonHeightCm',
  'cartonGrossWeightKg',
  'palletLengthCm',
  'palletWidthCm',
  'maxStackHeightCm',
  'palletDeckHeightCm',
  'palletTareKg',
  'unitLengthCm',
  'unitWidthCm',
  'unitHeightCm',
];

describe('product packaging form', () => {
  it('offers an input for every packaging field the engine needs', () => {
    for (const key of REQUIRED_KEYS) {
      expect(source, `the form should expose ${key}`).toContain(`key: '${key}'`);
    }
  });

  it('writes and reads packaging through the same field list', () => {
    // save() builds the payload by iterating PACKAGING_FIELDS...
    expect(source).toMatch(/for \(const field of PACKAGING_FIELDS\) \{[\s\S]*?packaging\[field\.key\]/);
    // ...and productFormFrom(row) reads each of them back for an edit.
    expect(source).toMatch(/const packagingRaw = \(row\.packaging[\s\S]*?for \(const field of PACKAGING_FIELDS\) \{[\s\S]*?packaging\[field\.key\]/);
    // ...and the payload actually carries the record to the write route.
    expect(source).toMatch(/const payload = \{[\s\S]*?\bpackaging,\n\s*\};/);
  });

  it('saves the values that are on screen, not only the ones React was told about', () => {
    // A controlled input only reaches React through a change event, so a value a batch
    // script or a browser autofill writes straight into the box is visible to the owner but
    // invisible to the form state — and Save used to persist it as blank, losing the work
    // silently. Guard both halves of the read-back, since either one going stale turns the
    // safety net back off without failing anything else.
    expect(source, 'each box must be addressable').toMatch(/name=\{`packaging-\$\{field\.key\}`\}/);
    expect(source, 'save must look for the named boxes').toContain('input[name^="packaging-"]');
    expect(source, 'the reader must strip the same prefix').toContain("input.name.slice('packaging-'.length)");
    expect(source, 'save must read the boxes back').toMatch(/const onScreen = packagingValuesOnScreen\(\)/);
    expect(source, 'on-screen must win over stale state').toMatch(
      /onScreen\[field\.key\] \?\? form\.packaging\[field\.key\]/
    );
  });

  it('brings the editor into view when a product is opened from the table', () => {
    // The editor renders above the table, so without the scroll the row's pencil looks
    // broken to an owner working down the list — the form opened off-screen.
    expect(source).toContain('scrollToEditor(PRODUCT_EDITOR_ID)');
    expect(source).toMatch(/function startEdit\(row: WholesaleRow\)[\s\S]*?scrollToEditor\(PRODUCT_EDITOR_ID\)/);
    expect(source, 'the editor must carry the id the scroll looks for').toMatch(/id=\{PRODUCT_EDITOR_ID\}/);
  });
});
