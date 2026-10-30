/** Optional filters and promotions must never hold a successful catalog read. */
export async function loadCatalogProgressively<P, C, O>(input: {
  products: () => Promise<P>;
  categories: () => Promise<C>;
  offers: () => Promise<O>;
  onCategories: (value: C | null) => void;
  onOffers: (value: O | null) => void;
}): Promise<P> {
  void input.categories().then(input.onCategories, () => input.onCategories(null));
  void input.offers().then(input.onOffers, () => input.onOffers(null));
  return input.products();
}
