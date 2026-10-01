import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Product and Shop Page Flicker Prevention Audits', () => {
  const root = process.cwd();

  it('ProductImageGallery does not hide the initial image with opacity: 0', () => {
    const galleryPath = path.join(root, 'src/components/ProductImageGallery.tsx');
    const content = fs.readFileSync(galleryPath, 'utf8');

    // Must not have initial={{ opacity: 0 }} on the primary image
    expect(content).not.toContain('initial={{ opacity: 0 }}');
    // Must filter empty or whitespace strings
    expect(content).toContain('validImages');
    // AnimatePresence must disable initial animation on mount
    expect(content).toContain('initial={false}');
  });

  it('ProductDetailView does not use Framer Motion layout prop on page container', () => {
    const viewPath = path.join(root, 'src/components/ProductDetailView.tsx');
    const content = fs.readFileSync(viewPath, 'utf8');

    // Container should be a regular div, not <motion.div layout> which causes resize flicker
    expect(content).not.toContain('<motion.div\n      layout');
    expect(content).not.toContain('<motion.div layout');
  });

  it('ProductCard does not set initial opacity 0 with translateY scroll entrance', () => {
    const cardPath = path.join(root, 'src/components/ProductCard.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');

    // Cards in the catalog grid must not be hidden on SSR with opacity: 0
    expect(content).not.toContain('initial={{ opacity: 0, y: 40 }}');
  });

  it('ProductDetailPage supports initialRelated from server to prevent post-hydration pop-in', () => {
    const pdpPath = path.join(root, 'src/views/ProductDetailPage.tsx');
    const content = fs.readFileSync(pdpPath, 'utf8');

    expect(content).toContain('initialRelated');
    expect(content).toContain('if (initialProduct && initialProduct.slug === routeSlug)');
  });

  it('ProductsPage accepts initialCategoryKey from SSR Page to prevent category swap flash', () => {
    const pagePath = path.join(root, 'src/views/ProductsPage.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    expect(content).toContain('initialCategoryKey');
    // The hook also takes the products, because the pills are built from the
    // catalogue and a `?category=` value is validated against them.
    expect(content).toContain('useProductsCategoryFilter(initialCategoryKey, products)');
  });
});
