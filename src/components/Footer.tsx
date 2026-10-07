import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Phone, ArrowRight, Send } from 'lucide-react';
import { buildProductsCategoryPath } from '../lib/categoryContent';

/**
 * Business pages, all of which are real routes carrying the store's own content,
 * so every link resolves to a page that exists rather than to an anchor
 * placeholder.
 *
 * This is the list the approved public footer links, in its order. The migrated
 * `/faqs` and `/shipping` pages are still live routes; the footer does not link
 * them because the approved footer does not. Adding them back is a one-line
 * change to this array.
 */
const aboutLinks = [
  { label: 'About Himalayan Koh', to: '/about' },
  { label: 'Shop Products', to: '/products' },
  { label: 'Contact Us', to: '/contact' },
  { label: 'FAQs', to: '/faqs' },
];

/**
 * The shop's shelves, taken from the same taxonomy the catalogue uses.
 *
 * Each link is the shelf's own hub URL (`/products?category=<key>`), built from
 * `lib/catalog/niche.ts` through `categoryContent` rather than written out here,
 * so a shelf key can never drift from the filter the grid reads. A shelf with no
 * products yet is simply not linked — the navigation only advertises what the
 * shop can actually show.
 */
const productLinks = [
  { label: 'Edible Pink Salt', to: buildProductsCategoryPath('edible-pink-salt') },
  { label: 'Salt Licks', to: buildProductsCategoryPath('licks-blocks') },
];

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribeError(null);
    const value = email.trim();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setSubscribeError('Enter a valid email address.');
      return;
    }

    setSubscribing(true);
    try {
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'footer' }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to subscribe.');
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 4000);
    } catch (err) {
      setSubscribeError(
        err instanceof Error ? err.message : 'Unable to subscribe. Please try again.'
      );
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer id="contact" className="bg-charcoal text-cream">
      {/* Newsletter Strip */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-6">
          <div className="grid md:grid-cols-2 gap-4 md:gap-10 items-center">
            <div>
              <h3 className="font-serif text-xl md:text-2xl font-bold mb-2 text-white">
                Stay Updated
              </h3>
              <p className="text-white/90 text-sm md:text-base leading-relaxed">
                Subscribe for product updates, salt handling guides, and seasonal offers.
              </p>
            </div>
            <div>
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-light" />
                  <input
                    type="email" name="newsletterEmail" autoComplete="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={subscribing}
                    aria-label="Email address for newsletter"
                    className="w-full pl-11 pr-4 py-3 bg-white text-charcoal border border-white/20 rounded-xl placeholder:text-charcoal-light focus:outline-none focus:ring-2 focus:ring-himalayan transition-all disabled:opacity-60"
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={subscribing}
                  className={`px-7 min-h-11 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-himalayan/30 transition-all duration-300 disabled:opacity-70 ${
                    subscribed
                      ? 'bg-himalayan-green text-cream'
                      : 'bg-himalayan hover:bg-himalayan-dark text-cream'
                  }`}
                >
                  {subscribing ? (
                    <span>Subscribing…</span>
                  ) : subscribed ? (
                    'Subscribed!'
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Subscribe</span>
                    </>
                  )}
                </motion.button>
              </form>
              <p className="mt-2 text-xs text-white/75 leading-relaxed">
                By subscribing, you agree to receive commercial and educational emails from Himalayan Koh. You may unsubscribe at any time. Read our{' '}
                <Link prefetch={false} to="/privacy" className="underline hover:text-white">
                  Privacy Policy
                </Link>
                .
              </p>
              {subscribeError && (
                <p role="alert" className="mt-2 text-sm text-amber-300">{subscribeError}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-7">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <img
              src="/logo.svg"
              alt="Himalayan Koh"
              loading="lazy"
              decoding="async"
              className="h-9 mb-3 brightness-0 invert"
            />
            <p className="text-white/75 text-sm leading-relaxed mb-4 max-w-xs">
              Pure, mineral-dense Himalayan pink rock salt for livestock, equine management, wildlife, and gourmet culinary cooking. Sourced from Khewra, Pakistan and distributed from Houston, Texas.
            </p>

          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-serif font-bold text-base mb-3 text-white">Quick Links</h4>
            <ul className="space-y-2">
              {aboutLinks.map((link) => (
                <li key={link.label}>
                  <Link prefetch={false} to={link.to} state={'state' in link ? link.state : undefined} className="text-white/75 text-sm hover:text-himalayan transition-colors flex items-center gap-1 group">
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Products */}
          <div>
            <h4 className="font-serif font-bold text-base mb-3 text-white">Products</h4>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link prefetch={false} to={link.to} className="text-white/75 text-sm hover:text-himalayan transition-colors flex items-center gap-1 group">
                    <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-serif font-bold text-base mb-3 text-white">Contact Us</h4>
            <div className="space-y-3">
              <a href="mailto:sales@himalayankoh.com" className="flex items-center gap-3 text-white/75 text-sm hover:text-himalayan transition-colors">
                <Mail size={18} className="text-himalayan flex-shrink-0" />
                sales@himalayankoh.com
              </a>
              <a href="tel:8322246466" className="flex items-center gap-3 text-white/75 text-sm hover:text-himalayan transition-colors">
                <Phone size={18} className="text-himalayan flex-shrink-0" />
                (832) 224-6466
              </a>
            </div>

            {/* Trust badges */}
            <div className="mt-4 flex items-center gap-3">
              <div className="px-3 py-1.5 bg-white/10 rounded-lg text-xs text-white/75">
                🔒 Secure Checkout
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/70">
          <p>Copyright © 2026 Himalayan Koh. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link prefetch={false} to="/disclaimer" className="hover:text-white/75 transition-colors">Disclaimer</Link>
            <Link prefetch={false} to="/privacy" className="hover:text-white/75 transition-colors">Privacy Policy</Link>
            <Link prefetch={false} to="/terms" className="hover:text-white/75 transition-colors">Terms of Service</Link>
            <Link prefetch={false} to="/shipping" className="hover:text-white/75 transition-colors">Shipping Policy</Link>
            <Link prefetch={false} to="/returns" className="hover:text-white/75 transition-colors">Return Policy</Link>
            <Link prefetch={false} to="/faqs" className="hover:text-white/75 transition-colors">FAQs</Link>
            <Link prefetch={false} to="/sitemap" className="hover:text-white/75 transition-colors">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
