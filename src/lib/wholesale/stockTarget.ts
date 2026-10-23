import type { AdminProductRecord, WooVariationLike } from '@/lib/woo/productPayload';

export function wholesaleStockTarget(product: AdminProductRecord, variations: WooVariationLike[], variationId: number, sku: string) {
  const variation = variationId ? variations.find((row) => row.id === variationId) : null;
  if (variationId && !variation) throw new Error('The linked variation could not be verified.');
  const actualSku = variation ? variation.sku : product.sku;
  if (!actualSku || actualSku.toLowerCase() !== sku.trim().toLowerCase()) throw new Error('The linked SKU does not match. Review the product link before changing stock.');
  const ownVariation = variation?.manage_stock === true;
  const quantity = ownVariation ? variation.stock_quantity : product.stockQuantity;
  if ((!ownVariation && !product.manageStock) || !Number.isSafeInteger(quantity) || Number(quantity) < 0) {
    throw new Error('Tracked stock is not configured. Review this product in the retail product editor.');
  }
  return { parentId: product.id, variationId: ownVariation ? variationId : 0, quantity: Number(quantity), sku: actualSku };
}
