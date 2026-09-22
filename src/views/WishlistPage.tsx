import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { SkeletonProductGrid } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import DashboardSidebar from '../components/account/DashboardSidebar';
import { useAuthContext } from '../context/AuthContext';
import { wishlistApi } from '../lib/wishlist/client';
import type { WishlistItem } from '../lib/wishlist/client';
import { useCart } from '../store/cartStore';

export default function WishlistPage() {
  const { user, profile } = useAuthContext();
  const { addItem } = useCart();
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWishlist = async () => {
      // Wait for the session before asking: the wishlist route identifies the
      // owner from it, so a signed-out request would only be told to sign in.
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setWishlist(await wishlistApi.getWishlist());
      } catch (err) {
        console.error('Failed to fetch wishlist:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWishlist();
  }, [user?.id]);

  const handleRemove = async (productId: number) => {
    if (!user?.id) return;
    await wishlistApi.removeFromWishlist(productId);
    setWishlist((current) => current.filter((item) => item.product_id !== productId));
  };

  const handleAddToCart = async (item: WishlistItem) => {
    await addItem({
      id: String(item.product.id),
      name: item.product.name,
      // Display only: the cart is WooCommerce's and prices the line itself, so a
      // product whose price the catalog cannot report still adds cleanly.
      price: item.product.priceMin ?? 0,
      image: item.product.image || '/images/placeholder-product.svg',
    });
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-4 py-1.5 bg-himalayan/20 text-himalayan text-sm font-semibold tracking-wider uppercase rounded-full mb-5"
          >
            Wishlist
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5 leading-tight"
          >
            Saved Products
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/75 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
          >
            Keep track of Himalayan Koh products you want to revisit.
          </motion.p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-4 gap-8">
          <DashboardSidebar profile={profile} user={user} />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-3"
          >
            {loading ? (
              <SkeletonProductGrid count={4} />
            ) : wishlist.length === 0 ? (
              <EmptyState
                icon={<Heart size={48} />}
                title="No Saved Products Yet"
                description="Products you save will appear here."
                action={{ label: 'Browse Products', href: '/products' }}
              />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {wishlist.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl shadow-md overflow-hidden">
                    <img
                      src={item.product.image || '/images/placeholder-product.svg'}
                      alt={item.product.name}
                      className="w-full aspect-square object-cover bg-gray-100"
                    />
                    <div className="p-5">
                      <h3 className="font-semibold text-charcoal text-sm leading-snug line-clamp-2 mb-2">
                        {item.product.name}
                      </h3>
                      {/* The catalog's own display string, so an unreported price
                          reads as unknown rather than as $0.00. */}
                      <p className="text-himalayan font-bold mb-5">
                        {item.product.price || 'Price unavailable'}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddToCart(item)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors text-sm"
                        >
                          <ShoppingBag size={16} />
                          Add to Cart
                        </button>
                        <button
                          onClick={() => handleRemove(item.product_id)}
                          className="w-11 h-11 inline-flex items-center justify-center border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
