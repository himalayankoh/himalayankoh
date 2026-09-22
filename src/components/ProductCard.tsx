import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart, Heart, Eye } from 'lucide-react';
import { Product } from '../data/products';
import { findVariationOption } from '../lib/woo/variationOptions';
import { formatPriceDisplay, isPriceKnown } from '../lib/products/price';
import { useCart } from '../store/cartStore';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { wishlistApi } from '../lib/wishlist/client';

interface Props {
  product: Product;
  index: number;
  onQuickView?: (product: Product) => void;
  /** Category hub left column — stronger shop affordance */
  shopHighlight?: boolean;
}

export default function ProductCard({ product, index, onQuickView, shopHighlight }: Props) {
  const [qty, setQty] = useState(1);
  // The choice list comes from the store's real variations when the product is
  // variable; `grainSizes` is the same list's labels, and stays the fallback for a
  // hand-written catalog entry.
  const grainChoices = product.variations?.options.map((option) => option.label) ?? product.grainSizes ?? [];
  const [selectedGrain, setSelectedGrain] = useState(grainChoices[0] || '');
  const [wishlisted, setWishlisted] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const { addItem } = useCart();
  const { user } = useAuthContext();
  const toast = useToast();

  // A product with no reported price cannot be sold: the cart line needs a
  // real unit price, and falling back to 0 would let a customer check out for
  // free. The backend reports `priceMin: null` for exactly this case.
  const priceKnown = isPriceKnown(product);

  const handleAddToCart = async () => {
    if (!priceKnown) {
      toast.error(`${product.name} has no price available yet.`);
      return;
    }
    try {
      // The chosen option, addressed the way the cart needs it. A product with a
      // choice but no matching variation sends none rather than an invented pair.
      const option = findVariationOption(product.variations, selectedGrain);
      await addItem({
        id: String(product.id),
        name: product.name,
        price: product.priceMin as number,
        image: product.image,
        grainSize: selectedGrain || undefined,
        ...(option ? { variation: { attribute: option.attribute, value: option.value } } : {}),
      }, qty);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add item to cart. Please try again.');
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
      className={`group bg-white rounded-2xl overflow-hidden transition-all duration-300 ${
        shopHighlight
          ? 'shadow-md shadow-himalayan/10 border border-himalayan/15 hover:shadow-xl hover:shadow-himalayan/20 hover:border-himalayan/35'
          : 'shadow-md shadow-black/5 hover:shadow-xl hover:shadow-himalayan/10'
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-gray-50">
        <Link to={`/products/${product.slug}`} className="block w-full h-full">
          <img
            src={product.image?.trim() || '/images/placeholder-product.svg'}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-product.svg'; }}
          />
        </Link>

        {/* Overlay buttons */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onQuickView?.(product)}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-himalayan hover:text-white transition-colors"
            aria-label="Quick view"
          >
            <Eye size={18} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleWishlist}
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors ${
              wishlisted ? 'bg-himalayan text-white' : 'bg-white hover:bg-himalayan hover:text-white'
            }`}
          >
            <Heart size={18} fill={wishlisted ? 'currentColor' : 'none'} />
          </motion.button>
        </div>

        {/* Badge — shown only when the product is explicitly featured */}
        {product.isFeatured && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-himalayan text-white text-xs font-bold rounded-full">
            Featured
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 md:p-4">
        <h3 className="font-semibold text-charcoal text-sm leading-snug line-clamp-2 mb-1.5 min-h-10">
          <Link
            to={`/products/${product.slug}`}
            className="group-hover:text-himalayan transition-colors"
          >
            {product.name}
          </Link>
        </h3>

        <p className="text-himalayan font-bold text-base mb-2.5">
          {formatPriceDisplay(product)}
        </p>

        {/* Grain Size Selector */}
        {grainChoices.length > 0 && (
          <select
            value={selectedGrain}
            onChange={(e) => setSelectedGrain(e.target.value)}
            className="w-full mb-2.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
          >
            {grainChoices.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}

        {/* Quantity + Add to Cart */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setQty(Math.max(1, qty - 1))}
              className="px-3 py-2 text-sm hover:bg-gray-100 transition-colors font-semibold text-charcoal"
            >
              −
            </button>
            <span className="px-3 py-2 text-sm font-semibold min-w-[2rem] text-center border-x border-gray-200 text-charcoal">
              {qty}
            </span>
            <button
              onClick={() => setQty(qty + 1)}
              className="px-3 py-2 text-sm hover:bg-gray-100 transition-colors font-semibold text-charcoal"
            >
              +
            </button>
          </div>
          <motion.button
            whileHover={priceKnown ? { scale: 1.02 } : undefined}
            whileTap={priceKnown ? { scale: 0.98 } : undefined}
            onClick={handleAddToCart}
            disabled={!priceKnown}
            className={`flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl font-semibold text-sm transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
              addedToCart
                ? 'bg-himalayan-green text-white'
                : 'bg-himalayan hover:bg-himalayan-dark text-white'
            }`}
          >
            <ShoppingCart size={16} />
            {addedToCart ? 'Added!' : 'Add to Cart'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
