import { useEffect, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Heart, Check, Minus, Plus, ChevronRight, Loader2 } from 'lucide-react';
import type { Product } from '../data/products';
import { findVariationOption } from '../lib/woo/variationOptions';
import { isPriceKnown, variationPriceDisplay } from '../lib/products/price';
import { getProductDisplayName } from '../lib/products/productSeo';
import { useCart } from '../store/cartStore';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { wishlistApi } from '../lib/wishlist/client';
import ProductImageGallery from './ProductImageGallery';
import {
  buildProductsCategoryPath,
  categoryFilterLabelForProduct,
  productCategoryFilterKey,
} from '../lib/categoryContent';

interface ProductDetailViewProps {
  product: Product;
  variant?: 'page' | 'modal';
  onClose?: () => void;
}

export default function ProductDetailView({
  product,
  variant = 'page',
  onClose,
}: ProductDetailViewProps) {
  const dialogRef = useDialogFocus(variant === 'modal', () => onClose?.());
  const [qty, setQty] = useState(1);
  // The store's real variations when the product is variable, `grainSizes`
  // otherwise — one list either way, so the selector cannot show an option the
  // cart cannot name.
  // A variable product's price depends on which option is chosen, so nothing is
  // preselected and the product-level range is what shows until the shopper picks.
  // Defaulting to the first option would present the cheapest price as *the*
  // price, and a shopper on "2kg" would read the "1kg" figure.
  const variationOptions = product.variations?.options ?? [];
  const hasVariations = variationOptions.length > 0;
  const grainChoices = hasVariations
    ? variationOptions.map((option) => option.label)
    : product.grainSizes ?? [];
  const [selectedGrain, setSelectedGrain] = useState('');
  const [addedToCart, setAddedToCart] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
  const { addItem } = useCart();
  const { user } = useAuthContext();
  const toast = useToast();
  const displayName = getProductDisplayName(product);
  // The crumb names the category the owner filed the product under, through the
  // same taxonomy the filter row uses — so the two can never disagree. The shelf
  // resolver is not enough on its own: it only knows the shelves the taxonomy has
  // copy for, and a product filed under a newer WooCommerce category (the
  // livestock pouches under `Live Stock`) falls back to `Edible Pink Salt` while
  // its own eyebrow, which reads the category straight, says otherwise.
  const categoryKey = productCategoryFilterKey(product);
  const categoryShopPath = categoryKey ? buildProductsCategoryPath(categoryKey) : '/products';
  const categoryShopLabel = categoryKey ? categoryFilterLabelForProduct(product, categoryKey) : 'Products';

  useEffect(() => {
    setQty(1);
    // Nothing preselected for a variable product (see above); a simple product's
    // grain list is a description, not a choice, so its first entry stands.
    setSelectedGrain(product.variations?.options?.length ? '' : product.grainSizes?.[0] ?? '');
    setAddedToCart(false);
  }, [product.id, product.grainSizes, product.variations]);

  // No reported price means the product cannot be sold yet — the cart line
  // needs a real unit price and 0 would allow a free checkout.
  const priceKnown = isPriceKnown(product);

  const selectedOption = findVariationOption(product.variations, selectedGrain);
  const selectedOutOfStock = selectedOption !== undefined && selectedOption.inStock === false;
  /** A variable product cannot be added until the shopper names the option. */
  const needsOption = hasVariations && selectedOption === undefined;

  // The chosen option's own price once there is one, the product's range before
  // that (see `variationPriceDisplay`).
  const displayPrice = variationPriceDisplay(product, selectedOption);

  // The option's own shot, when the store has one, ahead of the product's gallery.
  const variationImage = selectedOption?.image?.trim() || null;
  const galleryImages = Array.from(
    new Set(
      [...(variationImage ? [variationImage] : []), ...(product.images || []), product.image].filter(
        (img): img is string => typeof img === 'string' && img.trim().length > 0
      )
    )
  );

  const addToCartLabel = isAdding
    ? 'Adding…'
    : addedToCart
      ? 'Added to Cart!'
      : needsOption
        ? 'Choose an option'
        : selectedOutOfStock
          ? 'Out of stock'
          : 'Add to Cart';

  // Tracked units are a ceiling, not a suggestion: a customer cannot order past
  // what the warehouse reports. No count means no ceiling, because inventing one
  // would block an order the source never said was too large.
  const maxQuantity =
    typeof product.stockQuantity === 'number' && Number.isFinite(product.stockQuantity)
      ? Math.max(0, product.stockQuantity)
      : null;

  // Switching products must not leave a quantity the new product cannot fill.
  useEffect(() => {
    if (maxQuantity === null) return;
    setQty((current) => Math.min(Math.max(1, current), Math.max(1, maxQuantity)));
  }, [maxQuantity]);

  const handleAddToCart = async () => {
    if (isAdding) return;
    if (!priceKnown) {
      toast.error(`${product.name} has no price available yet.`);
      return;
    }
    if (needsOption) {
      toast.error(`Choose an option for ${product.name} first.`);
      return;
    }
    setIsAdding(true);
    try {
      const option = selectedOption;
      await addItem(
        {
          id: String(product.id),
          name: product.name,
          // The option's own price when one is chosen, so the optimistic line
          // matches what the store is about to price. WooCommerce still prices
          // the cart line itself; this is only what is shown while it answers.
          price: (option?.price ?? product.priceMin) as number,
          image: product.image,
          grainSize: selectedGrain || undefined,
          ...(option ? { variation: { attribute: option.attribute, value: option.value } } : {}),
        },
        qty
      );
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add item to cart. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleWishlist = async () => {
    // Signed out, there is nothing to save to — the flip is local and the heart
    // goes back on reload. Unchanged from before; the wishlist has always been an
    // account feature.
    if (!user?.id) {
      setWishlisted(!wishlisted);
      return;
    }

    try {
      // No user id is passed: the route takes the owner from the session, so this
      // component cannot name an account other than the signed-in one.
      setWishlisted(await wishlistApi.toggleWishlist(String(product.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your wishlist could not be updated.');
    }
  };

  const details = (
    <div
      className={
        variant === 'modal'
          ? 'bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl'
          : 'bg-white rounded-3xl shadow-lg overflow-hidden'
      }
      onClick={variant === 'modal' ? (e) => e.stopPropagation() : undefined}
    >
      {variant === 'page' && (
        <nav className="px-6 py-4 border-b border-gray-100 text-sm text-charcoal-light" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link to="/" className="hover:text-himalayan transition-colors">
                Home
              </Link>
            </li>
            <ChevronRight size={14} className="mx-0.5 shrink-0" />
            <li>
              <Link
                to={categoryKey ? '/products' : categoryShopPath}
                className="hover:text-himalayan transition-colors"
              >
                Products
              </Link>
            </li>
            {categoryKey && (
              <>
                <ChevronRight size={14} className="mx-0.5 shrink-0" />
                <li>
                  <Link to={categoryShopPath} className="hover:text-himalayan transition-colors">
                    {categoryShopLabel}
                  </Link>
                </li>
              </>
            )}
            <ChevronRight size={14} className="mx-0.5 shrink-0" />
            <li className="text-charcoal font-medium line-clamp-1">{displayName}</li>
          </ol>
        </nav>
      )}

      <div className="grid md:grid-cols-2 gap-0">
        <div className="relative md:aspect-auto bg-gray-50 min-h-72 md:min-h-96">
          {/* The product shot is the LCP element on a PDP — fetch it eagerly and
              at high priority rather than letting it queue behind other assets. */}
          <ProductImageGallery
            // The chosen option's own shot leads, so selecting an option changes
            // the picture the way it changes the price. `key` remounts the gallery
            // on that change, because a gallery that stays on slide 3 would keep
            // showing a different angle of the pack the shopper just left.
            key={variationImage ?? 'product'}
            images={galleryImages}
            alt={displayName}
            variant={variant}
            rounded={variant === 'modal' ? 'md:rounded-l-3xl' : ''}
            srcsets={product.imageResponsive}
          />
          {variant === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 md:hidden w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-4 sm:p-6 md:p-8 relative">
          {variant === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hidden md:flex absolute top-4 right-4 w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-full items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}

          <p className="text-xs font-bold uppercase tracking-wider text-himalayan mb-2">
            {product.category}
          </p>

          <h1 className="font-serif text-xl md:text-2xl font-bold text-charcoal mb-3 leading-snug pr-8">
            {displayName}
          </h1>

          <p className={`text-himalayan font-bold text-2xl ${hasVariations ? 'mb-1' : 'mb-4'}`}>
            {displayPrice}
          </p>
          {hasVariations && (
            <p className="text-xs text-charcoal-light mb-4">
              {selectedOption
                ? `${selectedOption.label}${selectedOption.sku ? ` · ${selectedOption.sku}` : ''}`
                : 'Select an option to see its exact price.'}
            </p>
          )}

          {/* Only an explicit out-of-stock report is shown. A source that
              cannot report stock at all (stockStatus 'unknown') must not be
              described as out of stock — that is a claim we did not receive. */}
          {product.stockStatus === 'out_of_stock' && (
            <p className="text-sm font-semibold text-red-600 mb-4">Currently out of stock</p>
          )}
          {/* An unknown stock state also disables Add to Cart, so it has to say
              why — otherwise the button looks broken rather than honest. */}
          {product.stockStatus === 'unknown' && (
            <p className="text-sm font-semibold text-charcoal/60 mb-4">
              {priceKnown
                ? 'Availability to be confirmed — add to cart is off until the warehouse reports stock'
                : 'Price and availability to be confirmed'}
            </p>
          )}

          {product.description && (
            <p className="text-charcoal-light text-sm leading-relaxed mb-5">{product.description}</p>
          )}

          <div className="space-y-2 mb-5">
            {/* Three claims, each traceable to the business's own product copy
                ("100% Natural & Unrefined", "Over 80 essential minerals", packed in
                Houston TX). A previous line here advertised "Free Shipping on $50+",
                which appears nowhere in production content — shipping is priced by
                weight and destination — so it is gone rather than implied. */}
            {['100% Natural & Unrefined', 'Naturally occurring trace minerals', 'Packed in Houston, Texas'].map((feat) => (
              <div key={feat} className="flex items-center gap-2 text-sm text-charcoal">
                <Check size={16} className="text-green-500 flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>

          {grainChoices.length > 0 && (
            <div className="mb-5">
              <label className="block text-sm font-semibold text-charcoal mb-2">{product.variations?.attributeLabel ?? 'Grain Size'}</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label={product.variations?.attributeLabel ?? 'Grain Size'}>
                {grainChoices.map((g) => {
                  // An option the store cannot sell is still shown — hiding it would
                  // hide the shape of the choice — but it is marked, so the shopper
                  // is not left clicking into the store's own refusal.
                  const choice = findVariationOption(product.variations, g);
                  const unavailable = choice !== undefined && choice.inStock === false;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSelectedGrain(g)}
                      aria-pressed={selectedGrain === g}
                      title={unavailable ? `${g} is out of stock` : undefined}
                      className={`min-h-11 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedGrain === g
                          ? 'border-himalayan bg-himalayan/10 text-himalayan'
                          : 'border-gray-200 text-charcoal hover:border-himalayan/50'
                      } ${unavailable ? 'opacity-60 line-through decoration-charcoal/40' : ''}`}
                    >
                      {g}
                      {unavailable && <span className="sr-only"> (out of stock)</span>}
                    </button>
                  );
                })}
              </div>
              {selectedOutOfStock && (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  {selectedOption?.label} is out of stock — choose another option.
                </p>
              )}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-sm font-semibold text-charcoal mb-2">Quantity</label>
            <div className="inline-flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="px-4 py-3 hover:bg-gray-100 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <span className="px-5 py-3 font-semibold min-w-[3rem] text-center border-x border-gray-200">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty(maxQuantity === null ? qty + 1 : Math.min(maxQuantity, qty + 1))}
                disabled={maxQuantity !== null && qty >= maxQuantity}
                className="px-4 py-3 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>
            {maxQuantity !== null && (
              <p className="mt-2 text-xs text-charcoal/60">
                {maxQuantity} available — order up to {maxQuantity} in one go.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <motion.button
              type="button"
              whileHover={!isAdding ? { scale: 1.02 } : undefined}
              whileTap={!isAdding ? { scale: 0.98 } : undefined}
              onClick={handleAddToCart}
              disabled={!product.inStock || !priceKnown || isAdding || needsOption || selectedOutOfStock}
              aria-live="polite"
              aria-busy={isAdding}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                addedToCart
                  ? 'bg-green-500 text-white'
                  : 'bg-himalayan hover:bg-himalayan-dark text-white shadow-lg shadow-himalayan/25'
              }`}
            >
              {isAdding ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              {addToCartLabel}
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleWishlist}
              className="w-14 h-14 border-2 border-gray-200 rounded-xl flex items-center justify-center hover:border-himalayan hover:text-himalayan transition-colors"
              aria-label="Add to wishlist"
              aria-pressed={wishlisted}
            >
              <Heart size={20} fill={wishlisted ? 'currentColor' : 'none'} />
            </motion.button>
          </div>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-charcoal-light"><Link to="/shipping" className="underline underline-offset-4">Shipping & delivery</Link><Link to="/returns" className="underline underline-offset-4">Returns & eligibility</Link><Link to="/contact" className="underline underline-offset-4">Product questions</Link></p>
        </div>
      </div>
    </div>
  );

  if (variant === 'modal') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={displayName} tabIndex={-1} className="max-h-[90dvh] overflow-y-auto w-full max-w-5xl rounded-2xl">{details}</div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return details;
}
