import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Link } from 'react-router-dom';
// usePathname instead of useLocation: useLocation reads search params, which
// opts every route rendering this layout out of static prerendering, leaving
// crawlers with the loading fallback. The nav only needs the pathname.
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, ShoppingCart, User, Menu, X, Phone, MessageCircle, LogOut } from 'lucide-react';
import { useCart } from '../store/cartStore';
import { useAuthContext } from '../context/AuthContext';
import { signOutOfBrowser } from '../lib/auth/browserSignOut';
import CartDrawer from './CartDrawer';
import SearchModal from './SearchModal';
const AuthModal = lazy(() => import('./AuthModal'));
import AIChatWidget from './AIChatWidget';
import Footer from './Footer';
import ScrollToTop from './ScrollToTop';

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Products', path: '/products' },
  { label: 'About Us', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const mobileDialog = useDialogFocus(mobileOpen, () => setMobileOpen(false));
  const headerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? '/';
  // Respected rather than assumed: a page that slides in is motion sickness for
  // some readers, and the transition is decoration, not information.
  const reduceMotion = useReducedMotion();
  const { totalItems } = useCart();
  const { isAuthenticated, profile, user, isAdmin } = useAuthContext();

  /**
   * The signed-in menu, which is not the same menu for both roles.
   *
   * An administrator's account lives in the console, so offering them "My
   * Account → /account" sent them into the customer portal and made them choose
   * a second identity to get back. One destination per role, decided here and
   * mirrored by the guards (`lib/auth/roleRouting`).
   */
  const accountMenuItems = isAdmin
    ? [
        { label: 'Admin Console', to: '/admin' },
      ]
    : [
        { label: 'My Account', to: '/account' },
        { label: 'My Orders', to: '/account?tab=orders' },
      ];

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--header-height',
        `${entry.contentRect.height}px`
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSignOut = () => {
    // Both credentials this browser holds are cleared synchronously by their one
    // owner (`lib/auth/browserSignOut`), then we hard-navigate home. We do not
    // call supabase.auth.signOut(): it can hang and can re-persist the session.
    signOutOfBrowser();
    setUserMenuOpen(false);
    window.location.assign('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-skip focus:px-4 focus:py-2 focus:bg-himalayan-green focus:text-cream focus:rounded-lg"
      >
        Skip to main content
      </a>
      {/* Announcement Bar + Navbar — sticky together so bar never scrolls away */}
      <div ref={headerRef} className="sticky top-0 z-nav">
      {/* Announcement Bar */}
      <div className="bg-warm-white border-b border-himalayan-line text-sm text-charcoal">
        <motion.div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
          <p className="text-center sm:text-left text-xs sm:text-sm tracking-wide flex-1">
            <strong className="font-semibold text-himalayan">All Natural</strong>{' '}
            Himalayan salt for horses, cattle and deer
          </p>
          <div className="hidden sm:flex items-center gap-6 sm:gap-8 text-xs sm:text-sm font-medium flex-shrink-0">
            <a href="tel:8322246466" className="flex items-center gap-1.5 text-charcoal hover:text-himalayan transition-colors whitespace-nowrap">
              <Phone size={16} />
              <span>(832) 224-6466</span>
            </a>
            <a href="https://wa.me/18322246466" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-charcoal hover:text-himalayan transition-colors" aria-label="WhatsApp">
              <MessageCircle size={16} />
            </a>
          </div>
        </motion.div>
      </div>

      {/* Navbar */}
      <header className="bg-cream border-b border-himalayan-line shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img
                src="/logo.svg"
                alt="Himalayan Koh — Salt that Heals"
                className="h-8 md:h-11 w-auto"
              />
            </Link>

            {/* Desktop Nav */}
            <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-0.5">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  prefetch={false}
                  aria-current={(pathname === link.path || (link.path === '/products' && pathname.startsWith('/products/'))) ? 'page' : undefined}
                  className={`relative px-3 py-2 text-[0.82rem] font-extrabold uppercase tracking-[0.035em] transition-colors rounded-lg ${
                    pathname === link.path
                      ? 'text-himalayan-dark'
                      : 'text-charcoal hover:text-himalayan-dark'
                  }`}
                >
                  {link.label}
                  {pathname === link.path && (
                    <motion.div
                      layoutId="navIndicator"
                      className="absolute bottom-0 left-3 right-3 h-0.5 bg-himalayan rounded-full"
                    />
                  )}
                </Link>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSearchOpen(true)}
                className="min-w-11 min-h-11 p-2 rounded-lg border border-himalayan-line hover:border-himalayan/40 hover:bg-warm-white transition-colors"
                aria-label="Search"
              >
                <Search size={20} className="text-charcoal" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCartOpen(true)}
                className="min-w-11 min-h-11 p-2 rounded-lg border border-himalayan-line hover:border-himalayan/40 hover:bg-warm-white transition-colors relative"
                aria-label="Cart"
              >
                <ShoppingCart size={20} className="text-charcoal" />
                {totalItems > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 bg-himalayan-green text-cream text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </motion.button>

              {/* User Menu */}
              <div className="relative hidden sm:block">
                {isAuthenticated ? (
                  <div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="min-w-11 min-h-11 p-2 rounded-lg border border-himalayan-line bg-warm-white transition-colors"
                    >
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={profile.full_name || 'User'}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                      ) : (
                        <User size={20} className="text-himalayan-green" />
                      )}
                    </motion.button>

                    <AnimatePresence>
                      {userMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-dropdown"
                        >
                          <div className="px-4 py-2 border-b border-gray-100">
                            <p className="font-semibold text-charcoal text-sm truncate">
                              {profile?.full_name || 'User'}
                            </p>
                            <p className="text-xs text-charcoal-light truncate">
                              {user?.email}
                            </p>
                          </div>
                          {accountMenuItems.map((item) => (
                            <Link
                              key={item.to}
                              to={item.to}
                              className="block px-4 py-2 text-sm text-charcoal hover:bg-gray-50"
                              onClick={() => setUserMenuOpen(false)}
                            >
                              {item.label}
                            </Link>
                          ))}
                          <button
                            onClick={handleSignOut}
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <LogOut size={14} />
                            Sign Out
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setAuthOpen(true)}
                    className="btn-hk-ghost !min-h-[46px] !px-4 !py-2 !text-xs"
                    aria-label="Login"
                  >
                    <User size={18} className="mr-1.5" />
                    Login
                  </motion.button>
                )}
              </div>

              {/* Mobile menu button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-full hover:bg-himalayan-lighter transition-colors"
                aria-label={mobileOpen ? 'Close menu' : 'Menu'}
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </motion.button>
            </div>
          </div>
        </div>
      </header>
      </div>{/* end sticky wrapper */}

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            id="mobile-navigation" ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}
            className="lg:hidden max-h-[calc(100dvh-var(--header-height))] overflow-y-auto fixed top-[var(--header-height)] left-0 right-0 z-nav-overlay bg-cream border-t border-himalayan-line shadow-xl"
          >
            <nav aria-label="Mobile navigation" className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              <button onClick={() => setMobileOpen(false)} className="min-h-11 px-4 text-sm text-charcoal-light" aria-label="Close menu">Close menu</button>
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.path}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.12 }}
                >
                  <Link
                    to={link.path}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-3 rounded-lg text-sm font-extrabold uppercase tracking-wide transition-colors ${
                      pathname === link.path
                        ? 'bg-warm-white text-himalayan-dark'
                        : 'text-charcoal hover:bg-warm-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              {isAuthenticated && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  className="pt-2 border-t border-himalayan-line/40"
                >
                  {accountMenuItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className="block px-4 py-3 rounded-lg text-sm font-semibold text-charcoal hover:bg-warm-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                {isAuthenticated ? (
                  <button
                    onClick={() => { handleSignOut(); setMobileOpen(false); }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-medium text-red-600 hover:bg-red-50 transition-colors w-full"
                  >
                    <LogOut size={18} />
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={() => { setAuthOpen(true); setMobileOpen(false); }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-medium text-charcoal hover:bg-gray-50 transition-colors w-full"
                  >
                    <User size={18} />
                    Login
                  </button>
                )}
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div
          className="fixed inset-0 z-nav-overlay"
          onClick={() => setUserMenuOpen(false)}
        />
      )}

      {/* Main Content.
          Keyed on pathname so each page settles in with a short rise and fade
          rather than replacing the last one in a single frame — that hard swap
          is what read as a flick. Keyed on the path only, not the query, so
          filtering the catalogue re-renders in place instead of remounting and
          refetching. */}
      <main id="main-content" className="flex-1 w-full max-w-full overflow-x-hidden" tabIndex={-1}>
        <motion.div
          key={pathname}
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Modals & Drawers */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      {authOpen && <Suspense fallback={<div role="status" className="fixed bottom-4 left-4 z-modal bg-white border rounded-lg p-4">Opening sign in…</div>}><AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} /></Suspense>}
      {!pathname.startsWith('/checkout') && <AIChatWidget />}
      <ScrollToTop />
    </div>
  );
}
