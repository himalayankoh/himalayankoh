import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./CatalogAdmin.tsx', import.meta.url)),
  'utf8',
);

/**
 * The editor marks a field and can save in the same tick — the SEO tab's
 * "Generate SEO & Save" writes four fields and calls the save immediately. A
 * `useState` set answers that save with the previous render's fields, so the
 * generated SEO was not in the patch while the toast said it was saved, and the
 * editor then showed the store's old values. The behaviour of the tracker is
 * tested in `dirtyFields.test.ts`; this pins the editor to using it, because
 * reverting to `useState` compiles and looks harmless.
 */
describe('Product editor edited-field tracking', () => {
  it('uses the synchronously readable tracker, not a state set', () => {
    expect(source).toContain('createDirtyFields()');
    expect(source).not.toMatch(/\[\s*dirtyFields\s*,\s*setDirtyFields\s*\]/);
    expect(source).not.toContain('setDirtyFields');
  });

  it('marks every edit through the tracker', () => {
    expect(source).toContain('dirtyFields.mark(k as string);');
    expect(source).toContain("dirtyFields.mark('images');");
    expect(source).toContain('dirtyFields.size() === 0');
    expect(source).toContain('dirtyFields.clear();');
  });

  it('keeps the SEO tab saving the fields it generated', () => {
    // The tab writes the generated values with `set(...)`, which is what marks
    // them, and then saves the product it just built.
    expect(source).toContain("set('seoTitle', nextProduct.seoTitle);");
    expect(source).toContain("set('seoDescription', nextProduct.seoDescription);");
    expect(source).toContain("set('seoKeywords', nextProduct.seoKeywords);");
    expect(source).toContain('await onSave(nextProduct);');
  });
});
