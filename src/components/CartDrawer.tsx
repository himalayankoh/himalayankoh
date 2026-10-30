import { useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../store/cartStore';
import { useToast } from '../context/ToastContext';
import EmptyState from './ui/EmptyState';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: Props) {
  const { items, removeItem, updateQuantity, totalItems, totalPrice, clearCart } = useCart();
  const toast = useToast();
  const dialogRef = useDialogFocus(isOpen, onClose);
  const reduceMotion = useReducedMotion();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const handleRemove = async (id: string, grainSize?: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    try {
      await removeItem(id, grainSize);
    } catch {
      toast.error('Failed to remove item. Please try again.');
    } finally { pendingRef.current = false; setPending(false); }
  };

  const handleUpdateQuantity = async (id: string, quantity: number, grainSize?: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    try {
      await updateQuantity(id, quantity, grainSize);
    } catch {
      toast.error('Failed to update quantity. Please try again.');
    } finally { pendingRef.current = false; setPending(false); }
  };

  const handleClearCart = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    try {
      await clearCart();
    } catch {
      toast.error('Failed to clear cart. Please try again.');
    } finally { pendingRef.current = false; setPending(false); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-drawer-backdrop bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            ref={dialogRef}
            role="dialog" aria-modal="true" aria-labelledby="cart-title" tabIndex={-1}
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="fixed right-0 top-0 bottom-0 z-drawer w-full max-w-md bg-white shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-himalayan" />
                <h2 id="cart-title" className="font-serif text-xl font-bold text-charcoal">
                  Your Cart ({totalItems})
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close cart"
                className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 sm:p-5" aria-busy={pending}>
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <EmptyState
                    icon={<ShoppingBag size={48} />}
                    title="Your cart is empty"
                    description="Add some premium Himalayan salt products!"
                    action={{ label: 'Continue Shopping', onClick: onClose }}
                    size="card"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item) => (
                    <motion.div
                      key={`${item.id}-${item.grainSize}`}
                      layout
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -30 }}
                      className="flex gap-4 p-3 bg-gray-50 rounded-xl"
                    >
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-xl flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-product.svg'; }}
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-charcoal text-sm leading-snug line-clamp-2 mb-1">
                          {item.name}
                        </h4>
                        {item.grainSize && (
                          <p className="text-xs text-charcoal-light mb-1">{item.grainSize}</p>
                        )}
                        <p className="text-himalayan font-bold text-sm">
                          ${item.price.toFixed(2)}
                        </p>
                        <div className="flex flex-wrap items-center justify-between mt-2">
                          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                            <button
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1, item.grainSize)}
                              aria-label={`Decrease quantity for ${item.name}${item.grainSize ? ` (${item.grainSize})` : ''}`}
                              disabled={pending}
                              className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-40"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="px-3 text-sm font-medium">{item.quantity}</span>
                            <button
                              onClick={() => handleUpdateQuantity(item.id, item.quantity + 1, item.grainSize)}
                              aria-label={`Increase quantity for ${item.name}${item.grainSize ? ` (${item.grainSize})` : ''}`}
                              disabled={pending}
                              className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-40"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => handleRemove(item.id, item.grainSize)}
                            aria-label={`Remove ${item.name}${item.grainSize ? ` (${item.grainSize})` : ''} from cart`}
                            disabled={pending}
                            className="w-11 h-11 flex items-center justify-center text-charcoal-light hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-charcoal-light">Subtotal</span>
                  <span className="font-bold text-xl text-charcoal">${totalPrice.toFixed(2)}</span>
                </div>
                <p role="status" className="text-xs text-charcoal-light">{pending ? 'Updating your cart…' : 'Shipping and tax calculated at checkout'}</p>
                <Link
                  to="/checkout"
                  onClick={event => { if(pending) event.preventDefault(); else onClose(); }}
                  aria-disabled={pending}
                  className="w-full flex items-center justify-center gap-2 min-h-12 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors shadow-lg shadow-himalayan/25"
                >
                  Proceed to Checkout
                  <ArrowRight size={18} />
                </Link>
                <button
                  disabled={pending}
                  onClick={handleClearCart}
                  className="w-full py-2 text-sm text-charcoal-light hover:text-red-500 transition-colors"
                >
                  Clear Cart
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
