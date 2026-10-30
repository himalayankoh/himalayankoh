export class UnsupportedPackingProductsError extends Error {
  readonly products: { productId?: string; name: string; slug: string }[];

  constructor(products: { productId?: string; name: string; slug: string }[]) {
    const labels = products.map((p) => p.name || p.slug || 'Unknown product').join(', ');
    // These are read by a shopper, so they name the item and stop. The message used to
    // promise that "Standard flat-rate shipping applies", which stopped being true when
    // the checkout stopped offering a hand-priced fallback alongside live rates.
    super(
      products.length === 1
        ? `We cannot price delivery for "${labels}" yet.`
        : `We cannot price delivery for: ${labels}.`,
    );
    this.name = 'UnsupportedPackingProductsError';
    this.products = products;
  }
}
