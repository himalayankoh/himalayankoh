// ============================================================================
// Editors open where the owner is looking
//
// Every panel in this console renders its editor *above* its table. Opening one from a
// row's pencil while the owner is scrolled down at the list therefore opened the form
// off-screen, and the click read as broken — the owner reported it as "the product does
// not open", and the cost profile panel still had it after the first pass fixed the other
// two. These panels are client components that render only behind an admin session, so
// the contract is asserted at the source level: each pencil has an editor, each editor has
// an id, and each id is scrolled to.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const config = read('./ConfigPanels.tsx');
const record = read('./RecordPanel.tsx');

/** A row pencil is the only way an owner opens an existing record to edit it. */
const PENCILS = /aria-label=\{`Edit /g;

describe('wholesale editors open in view', () => {
  it('gives every pencil an editor, and every editor an id to be scrolled to', () => {
    // Products & pricing and Cost profiles in ConfigPanels, plus the generic record panel
    // that stands behind every other flat list. A new pencil without an editor and a scroll
    // fails here rather than silently opening a form off-screen.
    const pencils = (config.match(PENCILS) ?? []).length + (record.match(PENCILS) ?? []).length;
    expect(pencils).toBe(3);

    const editors =
      (config.match(/id=\{[A-Z_]+_EDITOR_ID\}/g) ?? []).length + (record.match(/id=\{editorId\}/g) ?? []).length;
    expect(editors, 'one editor per pencil').toBe(pencils);
  });

  it('scrolls each editor into view from the panel that renders it', () => {
    // Named individually, not counted: a renamed constant would keep a count green while
    // the scroll looked for an id nothing renders any more.
    expect(config).toMatch(/scrollToEditor\(PRODUCT_EDITOR_ID\)/);
    expect(config).toMatch(/id=\{PRODUCT_EDITOR_ID\}/);
    expect(config).toMatch(/scrollToEditor\(COST_EDITOR_ID\)/);
    expect(config).toMatch(/id=\{COST_EDITOR_ID\}/);
    expect(record).toMatch(/scrollToEditor\(editorId\)/);
    expect(record).toMatch(/id=\{editorId\}/);
  });

  it('scrolls the blank form too, not only an existing record', () => {
    // "Add" sits in the panel header, above the editor. When the header is the only part
    // of the panel still on screen, the new form would otherwise open out of view.
    expect(config).toMatch(/startNew\(\)[\s\S]*?scrollToEditor\(PRODUCT_EDITOR_ID\)/);
    expect(record).toMatch(/startNew\(\)[\s\S]*?scrollToEditor\(editorId\)/);
  });
});
