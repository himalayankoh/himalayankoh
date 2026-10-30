import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./CatalogAdmin.tsx', import.meta.url)),
  'utf8',
);

describe('Products page hydration boundary', () => {
  it('starts with deterministic loading and filter state', () => {
    expect(source).toContain('const [products, setProducts] = useState<CatalogProduct[]>([]);');
    expect(source).toContain('const [loading, setLoading] = useState(true);');
    expect(source).toContain("const [colOrder, setColOrder] = useState<CatalogColumnKey[]>(() => loadCatalogColumns(null));");
    expect(source).toContain('const [hydrated, setHydrated] = useState(false);');
  });

  it('defers catalog loading and browser-derived values until hydration', () => {
    expect(source).toContain('setRenderNowMs(Date.now());');
    expect(source).toContain('setHydrated(true);');
    expect(source).toContain('if (!hydrated) return;');
    expect(source).toContain('void load();');
  });
});
