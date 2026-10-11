import type { Product } from '../../data/products';
import { productCategoryFilterKey } from '../../lib/categoryContent/keys';

/** Takes only the sealed public catalog; never reads or exposes admin records. */
export function relatedProducts(product: Product, catalog: Product[]): Product[] {
  const category = productCategoryFilterKey(product);
  const seen = new Set([String(product.id)]);
  return catalog.filter(candidate => {
    if (seen.has(String(candidate.id)) || !candidate.inStock || candidate.priceMin === null) return false;
    seen.add(String(candidate.id));
    return true;
  }).sort((a, b) => Number(productCategoryFilterKey(b) === category) - Number(productCategoryFilterKey(a) === category)).slice(0, 4);
}
