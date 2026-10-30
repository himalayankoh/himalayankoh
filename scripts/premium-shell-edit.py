exec(open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("p='src/views/HomePage.tsx'")[0])
replace('src/components/Layout.tsx',[
("import { useState, useRef, useEffect } from 'react';","import { useState, useRef, useEffect, lazy, Suspense } from 'react';\nimport { useDialogFocus } from '../hooks/useDialogFocus';"),
("import AuthModal from './AuthModal';","const AuthModal = lazy(() => import('./AuthModal'));"),
('  const [userMenuOpen, setUserMenuOpen] = useState(false);','  const [userMenuOpen, setUserMenuOpen] = useState(false);\n  const mobileDialog = useDialogFocus(mobileOpen, () => setMobileOpen(false));'),
('py-3 flex flex-col sm:flex-row','py-2 flex flex-col sm:flex-row'),
('className="flex items-center gap-6 sm:gap-8','className="hidden sm:flex items-center gap-6 sm:gap-8'),
('bg-cream/95 backdrop-blur-xl border-b border-himalayan-line shadow-[0_10px_30px_rgba(33,29,24,0.07)]','bg-cream border-b border-himalayan-line shadow-sm'),
('<nav className="hidden lg:flex','<nav aria-label="Main navigation" className="hidden lg:flex'),
('to={link.path}\n                  className=', 'to={link.path}\n                  prefetch={false}\n                  aria-current={(pathname === link.path || (link.path === \'/products\' && pathname.startsWith(\'/products/\'))) ? \'page\' : undefined}\n                  className='),
('className="p-2 rounded-lg border border-himalayan-line','className="min-w-11 min-h-11 p-2 rounded-lg border border-himalayan-line'),
('aria-label="Menu"','aria-label={mobileOpen ? \'Close menu\' : \'Menu\'}\n                aria-expanded={mobileOpen}\n                aria-controls="mobile-navigation"'),
('className="lg:hidden fixed top-[var(--header-height)]','id="mobile-navigation" ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}\n            className="lg:hidden max-h-[calc(100dvh-var(--header-height))] overflow-y-auto fixed top-[var(--header-height)]'),
('            <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">','            <nav aria-label="Mobile navigation" className="max-w-7xl mx-auto px-4 py-4 space-y-1">\n              <button onClick={() => setMobileOpen(false)} className="min-h-11 px-4 text-sm text-charcoal-light" aria-label="Close menu">Close menu</button>'),
('transition={{ delay: i * 0.05 }}','transition={{ duration: reduceMotion ? 0 : 0.12 }}'),
('initial={reduceMotion ? false : { opacity: 0, y: 6 }}','initial={false}'),
('<AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />','{authOpen && <Suspense fallback={<div role="status" className="fixed bottom-4 left-4 z-modal bg-white border rounded-lg p-4">Opening sign in…</div>}><AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} /></Suspense>}'),
('<AIChatWidget />',"{!pathname.startsWith('/checkout') && <AIChatWidget />}")])

p='src/components/Footer.tsx';s=read(p);start=s.index('const aboutLinks =');end=s.index('\n];',start)+3
s=s[:start]+'''const aboutLinks = [
  { label: 'About Himalayan Koh', to: '/about' },
  { label: 'Quality & Sourcing', to: '/quality' },
  { label: 'Resource Center', to: '/resources' },
  { label: 'Shop Products', to: '/products' },
  { label: 'Contact Us', to: '/contact' },
  { label: 'FAQs', to: '/faqs' },
];'''+s[end:]
s=s.replace('py-14 md:py-16','py-8 md:py-10').replace('text-white/40','text-white/70').replace('text-white/60','text-white/75')
s=s.replace('<Link to=', '<Link prefetch={false} to=')
s=s.replace('type="email"','type="email" name="newsletterEmail" autoComplete="email"')
s=s.replace('<p className="mt-2 text-sm text-amber-300">','<p role="alert" className="mt-2 text-sm text-amber-300">')
write(p,s)
replace('src/app/providers.tsx',[("import { AuthProvider }", "import { MotionConfig } from 'framer-motion';\nimport { AuthProvider }"),('<AuthProvider>','<MotionConfig reducedMotion="user"><AuthProvider>'),('</AuthProvider>','</AuthProvider></MotionConfig>')])

p='src/views/CheckoutPage.tsx';s=read(p)
s=s.replace('bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16','bg-cream border-b border-himalayan-line py-6 md:py-8').replace('text-3xl md:text-4xl font-bold text-white','text-3xl md:text-4xl font-bold text-charcoal').replace('text-white/70 mt-2','text-charcoal-light mt-2').replace('text-white/75 hover:text-white','text-charcoal-light hover:text-charcoal')
a=s.index('            <p className="font-semibold">Payments not configured'); b=s.index('          </div>',a)
s=s[:a]+'''            <p className="font-semibold">Card payments are currently unavailable.</p>
            <p className="mt-2">Please choose another available payment method or contact our team for help.</p>
'''+s[b:]
for key,attrs in {'email':'name="email" autoComplete="email"','phone':'type="tel" name="phone" autoComplete="tel"','fullName':'name="fullName" autoComplete="shipping name"','addressLine1':'name="addressLine1" autoComplete="shipping address-line1"','addressLine2':'name="addressLine2" autoComplete="shipping address-line2"','city':'name="city" autoComplete="shipping address-level2"','state':'name="state" autoComplete="shipping address-level1"','postalCode':'name="postalCode" autoComplete="shipping postal-code"','country':'name="country" autoComplete="shipping country-name"'}.items():
    s=s.replace('value={form.'+key+'}',attrs+' value={form.'+key+'}')
s=s.replace('Checkout fail-safe is active: click <strong>Place order (invoice)</strong> below to place your order with invoice/bank transfer. We will email you payment details.','Choose <strong>Place order (invoice)</strong> to request payment by invoice or bank transfer. Payment instructions will follow by email.')
s=s.replace('Invoice checkout fail-safe active — submit order without upfront card.','Payment by invoice — no card required to place your order.').replace('Enter card details after clicking Continue — test card 4242 4242 4242 4242.','Continue to enter your payment details securely.')
s=s.replace('placeholder="Enter coupon code"','aria-label="Coupon code" name="coupon" placeholder="Enter coupon code"').replace('placeholder="Gate code, delivery instructions, ranch drop-off notes, or product preferences"','aria-label="Delivery notes" name="deliveryNotes" placeholder="Gate code, delivery instructions, ranch drop-off notes, or product preferences"')
s=s.replace('className={`text-left rounded-2xl border p-4','aria-pressed={active}\n      className={`text-left rounded-xl border p-4')
s=s.replace('shadow-md p-6','border border-himalayan-line/60 shadow-sm p-4 sm:p-6')
s=s.replace('      {error && <span className="text-xs','      {error && <span role="alert" className="text-xs')
write(p,s)
