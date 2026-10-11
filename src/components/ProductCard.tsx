import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Eye, Loader2 } from 'lucide-react';
import { Product } from '../data/products';
import { findVariationOption } from '../lib/woo/variationOptions';
import { formatPriceDisplay, isPriceKnown } from '../lib/products/price';
import { useCart } from '../store/cartStore';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { wishlistApi } from '../lib/wishlist/client';
import { ORDERING_ENABLED } from '../lib/storefront/ordering';
import { productCardPath } from '../features/catalog/listingCards';
import { variationPriceDisplay } from '../lib/products/price';
import {
  CARD_IMAGE_SIZES,
  dropResponsiveCandidates,
  responsiveImageProps,
} from '../lib/images/responsiveImage';

interface Props {
  product: Product;
  index: number;
  onQuickView?: (product: Product) => void;
  /** Category hub left column — stronger shop affordance */
  shopHighlight?: boolean;
  /**
   * This card is the first one on screen, so its photo is the page's LCP
   * candidate.
   *
   * Opt-in per grid rather than `index === 0` everywhere, because on a product
   * page's related-products grid the first card is well below the fold: loading
   * it eagerly there only takes bandwidth from the images the visitor *is*
   * looking at. Measured on `/products` (2026-09-30, 1440×900): the first card's
   * photo was requested at 378 ms — after `DOMContentLoaded` at 235 ms — and was
   * the largest contentful paint at 382 ms.
   */
  priority?: boolean;
}

export default function ProductCard({ product, index, onQuickView, shopHighlight, priority }: Props) {
  const [qty, setQty] = useState(1);
  // The choice list comes from the store's real variations when the product is
  // variable; `grainSizes` is the same list's labels, and stays the fallback for a
  // hand-written catalog entry.
  const grainChoices = product.variations?.options.filter(option => !product.selectedVariationId || option.id === product.selectedVariationId).map((option) => option.label) ?? product.grainSizes ?? [];
  const [selectedGrain, setSelectedGrain] = useState(grainChoices[0] || '');
  const selectedOption = findVariationOption(product.variations, selectedGrain);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const imageUrl = [selectedOption?.image, product.image, ...(product.images ?? [])].find(url => url && !failedImages.includes(url)) || '/images/placeholder-product.svg';
  const [wishlisted, setWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const { addItem } = useCart();
  const { user } = useAuthContext();
  const toast = useToast();

  // A product with no reported price cannot be sold: the cart line needs a
  // real unit price, and falling back to 0 would let a customer check out for
  // free. The backend reports `priceMin: null` for exactly this case.
  const priceKnown = isPriceKnown(product);
  const stockQuantity = selectedOption ? selectedOption.stockQuantity : product.stockQuantity;
  const maxQuantity = typeof stockQuantity === 'number' ? Math.max(0, stockQuantity) : null;
  // A catalogue-only deployment offers no purchase at all, so the card must not render a
  // cart control it cannot honour. `ORDERING_ENABLED` is the build-time mirror of the
  // pause the server enforces (`lib/storefront/ordering.ts`), which is why a product
  // that is genuinely in stock and priced still shows no Add to Cart here.
  const canBuy = ORDERING_ENABLED && priceKnown && product.inStock && (!selectedOption || (selectedOption.inStock && selectedOption.price !== null)) && (maxQuantity === null || maxQuantity > 0);

  const [isAdding, setIsAdding] = useState(false);

  // The card draws a product photo a few hundred pixels wide, so it asks the
  // browser for the store's smaller candidates when one covers the slot and
  // falls back to the full-size image when none does. See
  // `lib/images/responsiveImage.ts`.
  const cardImage = responsiveImageProps(
    imageUrl,
    product.imageResponsive,
    CARD_IMAGE_SIZES
  );

  const handleAddToCart = async () => {
    if (isAdding || !canBuy) return;
    if (!priceKnown) {
      toast.error(`${product.name} has no price available yet.`);
      return;
    }
    setIsAdding(true);
    try {
      // The chosen option, addressed the way the cart needs it. A product with a
      // choice but no matching variation sends none rather than an invented pair.
      const option = findVariationOption(product.variations, selectedGrain);
      await addItem({
        id: String(option?.id ?? product.id),
        name: product.name,
        price: (option?.price ?? product.priceMin) as number,
        image: imageUrl,
        grainSize: selectedGrain || undefined,
        // The genuine child ID fully identifies the choice. Sending the REST
        // display label too can fail Woo's global-term slug validation (6 lb).
      }, qty);
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

  return (
    <div
      className={`group flex flex-col max-[399px]:grid max-[399px]:grid-cols-[112px_minmax(0,1fr)] min-w-0 bg-white rounded-2xl overflow-hidden border border-himalayan-line/60 transition-shadow duration-150 ${
        shopHighlight
          ? 'shadow-md shadow-himalayan/10 border border-himalayan/15 hover:shadow-xl hover:shadow-himalayan/20 hover:border-himalayan/35'
          : 'shadow-sm hover:shadow-md'
      }`}
    >
      {/* Image */}
      {/* 5:4 rather than square: the card is 20% shorter, so a grid row of products
          fits without scrolling and the listing reads denser on every breakpoint. */}
      <div className="relative aspect-[5/4] max-[399px]:aspect-auto max-[399px]:min-h-44 overflow-hidden bg-warm-white">
        <Link to={productCardPath(product)} className="block w-full h-full">
          <img
            src={cardImage.src}
            srcSet={cardImage.srcSet}
            sizes={cardImage.sizes}
            alt={product.name}
            className="w-full h-full object-contain p-2 motion-safe:group-hover:scale-[1.03] transition-transform duration-200"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            onError={(e) => {
              const image = e.currentTarget;
              // A candidate that 404s must not become the placeholder — drop the
              // candidate list and load the original instead. Only a failure of
              // the original itself is a broken image.
              if (dropResponsiveCandidates(image)) {
                image.src = cardImage.src;
                return;
              }
              if (imageUrl !== '/images/placeholder-product.svg') setFailedImages(failed => [...failed, imageUrl]);
            }}
          />
        </Link>

        {/* Overlay buttons */}
        <div className="absolute top-2 right-2 flex gap-1 pointer-events-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
          {onQuickView && <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onQuickView?.(product)}
            className="max-[399px]:hidden pointer-events-auto w-11 h-11 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-himalayan hover:text-white transition-colors"
            aria-label="Quick view"
          >
            <Eye size={18} />
          </motion.button>}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleWishlist}
            aria-label={`Save ${product.name} to wishlist`}
            aria-pressed={wishlisted}
            className={`pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              wishlisted ? 'bg-himalayan text-white' : 'bg-white hover:bg-himalayan hover:text-white'
            }`}
          >
            <Heart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
          </motion.button>
        </div>

        {/* Badge — shown only when the product is explicitly featured */}
        {product.isFeatured && !product.selectedVariationId && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-himalayan text-white text-xs font-bold rounded-full">
            Featured
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 min-w-0">
        <h3 className="font-semibold text-charcoal text-sm leading-snug mb-1 min-h-9 break-words line-clamp-3">
          <Link
            to={productCardPath(product)}
            className="group-hover:text-himalayan transition-colors"
          >
            {product.name}
          </Link>
        </h3>

        <p className="text-himalayan-dark font-bold text-lg mb-2 tabular-nums">
          {selectedOption ? variationPriceDisplay(product, selectedOption) : formatPriceDisplay(product)}
        </p>

        {/* Grain Size Selector */}
        {!product.selectedVariationId && grainChoices.length > 0 && (
          <select
            aria-label={`Choose ${product.variations?.attributeLabel ?? 'grain size'} for ${product.name}`}
            value={selectedGrain}
            onChange={(e) => { setSelectedGrain(e.target.value); setQty(1); }}
            className="w-full min-h-11 mb-2 px-2 bg-warm-white border border-himalayan-line rounded-lg text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
          >
            {grainChoices.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}

        {/* Quantity + Add to Cart — omitted entirely while ordering is paused: a stepper
            next to a disabled button still reads as a shop that takes orders. */}
        <div className="flex flex-col items-start gap-2 mt-auto">
          {ORDERING_ENABLED && (
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              aria-label={`Decrease quantity for ${product.name}`}
              disabled={qty <= 1 || isAdding}
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="min-h-11 min-w-11 px-2 py-2 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors font-semibold text-charcoal"
            >
              −
            </button>
            <span className="px-3 py-2 text-sm font-semibold min-w-[2rem] text-center border-x border-gray-200 text-charcoal">
              {qty}
            </span>
            <button
              aria-label={`Increase quantity for ${product.name}`}
              disabled={isAdding || (maxQuantity !== null && qty >= maxQuantity)}
              onClick={() => setQty(q => maxQuantity === null ? q + 1 : Math.min(q + 1, maxQuantity))}
              className="min-h-11 min-w-11 px-2 py-2 text-sm disabled:opacity-40 hover:bg-gray-100 transition-colors font-semibold text-charcoal"
            >
              +
            </button>
          </div>
          )}
          <motion.button
            whileHover={priceKnown && !isAdding ? { scale: 1.02 } : undefined}
            whileTap={priceKnown && !isAdding ? { scale: 0.98 } : undefined}
            onClick={handleAddToCart}
            disabled={!canBuy || isAdding}
            aria-live="polite"
            aria-busy={isAdding}
            className={`w-full flex items-center justify-center gap-2 min-h-11 rounded-xl font-semibold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
              addedToCart
                ? 'bg-himalayan-green text-white'
                : 'bg-himalayan hover:bg-himalayan-dark text-white'
            }`}
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : <ShoppingCart size={16} />}
            {!ORDERING_ENABLED
              ? 'Ordering unavailable'
              : isAdding
                ? 'Adding…'
                : addedToCart
                  ? 'Added!'
                  : !canBuy
                    ? (product.stockStatus === 'out_of_stock' || selectedOption?.inStock === false ? 'Out of stock' : 'Unavailable')
                    : 'Add to Cart'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
