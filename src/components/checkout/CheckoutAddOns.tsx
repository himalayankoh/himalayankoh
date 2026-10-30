import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { getCatalogProducts } from '../../lib/backend/catalogClient';
import { useCart } from '../../store/cartStore';
import type { Product } from '../../data/products';

/**
 * "Add to your order" — the checkout's own cross-sell row.
 *
 * Modelled on the marketplace checkout the owner asked for, but fed from *this*
 * shop's published catalogue through `/api/catalog`, so every row is a real
 * product at a real price. Nothing here is merchandised by hand and nothing is
 * invented: no bundle price, no "save 20%", no countdown.
 *
 * Three rules the row follows, each for a reason:
 *
 *  - **Simple products only.** A variable product has to have an option chosen
 *    before the cart will take it (`variations`), and picking one on the
 *    shopper's behalf is a guess about what they wanted. Those lines are left
 *    out rather than added under a variant the shopper never picked.
 *  - **Lines already in the order are left out.** Offering a product the shopper
 *    is already buying is not an offer.
 *  - **A failed or empty read renders nothing.** Cross-sell is a courtesy; a
 *    "could not load" box on the payment page is not worth the reassurance it
 *    costs.
 */
const MAX_ADD_ONS = 3;

/** Read enough of the catalogue that the filter above still has candidates. */
const CATALOG_READ_SIZE = 12;

export default function CheckoutAddOns() {
  const { items, addItem } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogProducts({ perPage: CATALOG_READ_SIZE })
      .then((result) => {
        if (!cancelled) setProducts(result.products);
      })
      .catch(() => {
        // Silent by design — see the note above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const inCart = new Set(items.map((item) => String(item.id)));
  const candidates = products
    .filter(
      (product) =>
        !inCart.has(String(product.id)) &&
        !product.variations &&
        product.inStock &&
        (product.priceMin ?? 0) > 0
    )
    .slice(0, MAX_ADD_ONS);

  if (candidates.length === 0) return null;

  const handleAdd = async (product: Product) => {
    setAdding(String(product.id));
    try {
      await addItem(
        {
          id: String(product.id),
          name: product.name,
          price: product.priceMin ?? 0,
          image: product.image,
        },
        1
      );
    } finally {
      setAdding(null);
    }
  };

  return (
    <section className="rounded-xl border border-himalayan-line/60 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-base font-bold text-charcoal sm:text-lg">Add to your order</h2>
        <span className="text-xs text-charcoal-light">From the Himalayan Koh catalogue</span>
      </div>
      <ul className="space-y-2">
        {candidates.map((product) => (
          <li key={String(product.id)} className="flex items-center gap-3">
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="h-12 w-12 flex-shrink-0 rounded-lg border border-himalayan-line/60 object-cover bg-warm-white"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-charcoal">{product.name}</p>
              <p className="mt-0.5 text-sm font-bold text-himalayan">{product.price}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleAdd(product)}
              disabled={adding !== null}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-himalayan-line px-3 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:border-himalayan hover:text-himalayan disabled:opacity-50"
            >
              {adding === String(product.id) ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Add
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
