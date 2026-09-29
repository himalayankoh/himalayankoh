// ============================================================================
// Console layout guards
//
// Two things the Products page and the admin rail rely on cannot be seen by a
// unit test of the render tree (both are plain Tailwind/CSS wiring, and the
// admin console needs a session to open in a browser):
//
//   1. A dragged column width only sticks under `table-layout: fixed`.
//   2. The collapsed rail and the content's left padding must read the same
//      width, or a collapsed menu leaves a stripe of dead space.
//
// These read the sources directly so a future edit that quietly drops one half
// of either pair fails here instead of in the owner's browser.
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const catalogSource = readFileSync(fileURLToPath(new URL('./CatalogAdmin.tsx', import.meta.url)), 'utf8');
const layoutSource = readFileSync(
  fileURLToPath(new URL('../components/admin/AdminLayout.tsx', import.meta.url)),
  'utf8',
);
const cssSource = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8');

describe('products table column resizing', () => {
  it('drives every column width from state through a colgroup', () => {
    expect(catalogSource).toContain(
      'const [colWidths, setColWidths] = useState<CatalogColumnWidths>(() => loadCatalogWidths(null));',
    );
    expect(catalogSource).toContain('{colOrder.map((k) => <col key={k} style={{ width: colWidths[k] }} />)}');
    expect(catalogSource).toContain('style={{ minWidth: catalogTableWidth(colWidths) }}');
  });

  it('keeps the fixed layout the dragged widths need', () => {
    expect(catalogSource).toContain('className="hk-catalog-table w-full"');
    expect(cssSource).toContain('.hk-catalog-table { table-layout: fixed; }');
  });

  it('restores widths after mount, saves them on mouse-up and can reset them', () => {
    expect(catalogSource).toContain('applyColWidths(loadCatalogWidths(window.localStorage), false);');
    expect(catalogSource).toContain(
      "saveCatalogWidths(next, typeof localStorage !== 'undefined' ? localStorage : null);",
    );
    expect(catalogSource).toContain('Reset column widths');
    expect(catalogSource).toContain('onDoubleClick={(e) => { e.stopPropagation(); resetColumnWidth(k); }}');
  });
});

describe('collapsible admin rail', () => {
  it('keeps one width for the rail and the content, published as a CSS variable', () => {
    expect(layoutSource).toContain("const railVars = { '--hk-rail': railMini ? RAIL_MINI : RAIL_FULL }");
    expect(layoutSource).toContain("className=\"hk-admin h-dvh w-full bg-[#FAF7F1] flex overflow-hidden font-sans\" style={railVars}");
    expect(layoutSource).toContain("lg:pl-[var(--hk-rail)]");
    expect(layoutSource).toContain("w-[var(--hk-rail)]");
  });

  it('remembers the choice per device and always renders a labelled drawer', () => {
    expect(layoutSource).toContain("const RAIL_STORAGE_KEY = 'hk_admin_rail_v1';");
    expect(layoutSource).toContain("if (window.localStorage.getItem(RAIL_STORAGE_KEY) === 'mini') setRailMini(true);");
    expect(layoutSource).toContain("window.localStorage.setItem(RAIL_STORAGE_KEY, next ? 'mini' : 'full');");
    // The mobile drawer cannot be icons-only — it is the only navigation there.
    expect(layoutSource).toContain('{renderSidebar({ mobile: true, mini: false })}');
    // Icons-only still needs an accessible name per item.
    expect(layoutSource).toContain("<span className={mini ? 'sr-only' : 'truncate'}>{l.label}</span>");
  });
});
