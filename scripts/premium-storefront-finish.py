exec(open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("p='src/views/HomePage.tsx'")[0])
tail=open('scripts/premium-storefront-edit.py',encoding='utf-8').read().split("replace('src/views/ProductsPage.tsx'",1)[1]
exec("replace('src/views/ProductsPage.tsx'"+tail.replace('Search products…','Search products...'))
replace('src/components/ProductDetailView.tsx',[
("import { useEffect, useState } from 'react';","import { useEffect, useState } from 'react';\nimport { useDialogFocus } from '../hooks/useDialogFocus';"),
('  const [qty, setQty] = useState(1);','  const dialogRef = useDialogFocus(variant === \'modal\', () => onClose?.());\n  const [qty, setQty] = useState(1);'),
('className="p-6 md:p-8 relative"','className="p-4 sm:p-6 md:p-8 relative"'),
('onClick={() => setSelectedGrain(g)}','onClick={() => setSelectedGrain(g)}\n                    aria-pressed={selectedGrain === g}'),
('className={`px-4 py-2 rounded-lg','className={`min-h-11 px-4 py-2 rounded-lg'),
('aria-label="Add to wishlist"','aria-label="Add to wishlist"\n              aria-pressed={wishlisted}'),
('disabled={!product.inStock || !priceKnown || isAdding}','disabled={!product.inStock || !priceKnown || isAdding}\n              aria-live="polite"\n              aria-busy={isAdding}'),
('          </div>\n        </div>\n      </div>\n    </div>\n  );','          </div>\n          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-charcoal-light"><Link to="/shipping" className="underline underline-offset-4">Shipping & delivery</Link><Link to="/returns" className="underline underline-offset-4">Returns & eligibility</Link><Link to="/contact" className="underline underline-offset-4">Product questions</Link></p>\n        </div>\n      </div>\n    </div>\n  );'),
('          {details}\n        </motion.div>','          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={displayName} tabIndex={-1} className="max-h-[90dvh] overflow-y-auto w-full max-w-5xl rounded-2xl">{details}</div>\n        </motion.div>')])

p='src/components/SearchModal.tsx';read(p);write(p,'''import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../data/products';
import { getCatalogProducts } from '../lib/backend/catalogClient';
import { formatPriceDisplay } from '../lib/products/price';
import { useDialogFocus } from '../hooks/useDialogFocus';

export default function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useDialogFocus(isOpen, onClose, input);
  useEffect(() => {
    if (!isOpen) { setQuery(''); return; }
    let active = true;
    setLoading(true); setError(false);
    getCatalogProducts().then(({products}) => { if(active) setProducts(products); })
      .catch(() => { if(active) setError(true); })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, attempt]);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\\s+/).filter(Boolean);
    return words.length ? products.filter(p => words.every(w => `${p.name} ${p.category}`.toLowerCase().includes(w))) : [];
  }, [products, query]);
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-modal bg-black/50 flex items-start justify-center px-3 pt-[8dvh] pb-4" onClick={onClose}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Product search" tabIndex={-1} onClick={e=>e.stopPropagation()} className="bg-white rounded-xl w-full max-w-2xl shadow-xl flex flex-col max-h-[84dvh] overflow-hidden">
      <div className="flex items-center gap-3 p-3 sm:p-5 border-b border-himalayan-line">
        <Search size={20} className="shrink-0 text-charcoal-light"/>
        <input ref={input} type="search" aria-label="Search products" placeholder="Search salt, weight or category…" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 text-base py-2 bg-transparent outline-none"/>
        <button onClick={onClose} aria-label="Close search" className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg hover:bg-warm-white"><X size={20}/></button>
      </div>
      <div className="overflow-y-auto min-h-32" aria-busy={loading}>
        {loading ? <p role="status" className="p-8 flex items-center justify-center gap-3 text-charcoal-light"><Loader2 size={18} className="animate-spin"/>Loading products…</p> : error ? <div role="alert" className="p-8 text-center"><p>Products could not be loaded.</p><button className="mt-3 underline min-h-11" onClick={()=>setAttempt(a=>a+1)}>Try again</button></div> : !query.trim() ? <div className="p-6 text-charcoal-light"><p>Search by product name, weight or category.</p><div className="flex flex-wrap gap-2 mt-4">{['Edible','Lick','Block'].map(q=><button key={q} className="border border-himalayan-line rounded-full px-4 min-h-11 hover:bg-warm-white" onClick={()=>setQuery(q)}>{q}</button>)}</div></div> : !results.length ? <p role="status" className="p-8 text-center text-charcoal-light">No products found. Try a different name or weight.</p> : results.map(p=><Link key={p.id} to={`/products/${p.slug}`} onClick={onClose} className="flex items-center gap-4 p-4 border-b border-himalayan-line/50 hover:bg-warm-white"><img src={p.image || '/images/placeholder-product.svg'} alt="" width={64} height={64} className="w-16 h-16 object-contain rounded-lg" loading="lazy"/><div className="min-w-0 flex-1"><p className="font-semibold text-sm">{p.name}</p><p className="text-himalayan-dark font-semibold text-sm mt-1">{formatPriceDisplay(p)}</p></div><ArrowRight size={16} className="shrink-0"/></Link>)}
      </div>
      <p role="status" className="px-4 py-3 text-xs text-charcoal-light border-t border-himalayan-line">{!loading && !error && query.trim() ? `${results.length} results · ` : ''}Press Escape to close</p>
    </div>
  </div>;
}
''')

replace('src/components/CartDrawer.tsx',[
("import { motion, AnimatePresence } from 'framer-motion';","import { useRef, useState } from 'react';\nimport { useDialogFocus } from '../hooks/useDialogFocus';\nimport { motion, AnimatePresence, useReducedMotion } from 'framer-motion';"),
('  const toast = useToast();','  const toast = useToast();\n  const dialogRef = useDialogFocus(isOpen, onClose);\n  const reduceMotion = useReducedMotion();\n  const pendingRef = useRef(false);\n  const [pending, setPending] = useState(false);'),
('    try {\n      await removeItem', '    if (pendingRef.current) return;\n    pendingRef.current = true; setPending(true);\n    try {\n      await removeItem'),
('    try {\n      await updateQuantity', '    if (pendingRef.current) return;\n    pendingRef.current = true; setPending(true);\n    try {\n      await updateQuantity'),
('    try {\n      await clearCart', '    if (pendingRef.current) return;\n    pendingRef.current = true; setPending(true);\n    try {\n      await clearCart'),
("Please try again.');\n    }", "Please try again.');\n    } finally { pendingRef.current = false; setPending(false); }"),
("initial={{ x: '100%' }}", "ref={dialogRef}\n            role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cart-title\" tabIndex={-1}\n            initial={reduceMotion ? false : { x: '100%' }}"),
("transition={{ type: 'spring', damping: 30, stiffness: 300 }}", "transition={{ duration: reduceMotion ? 0 : 0.18 }}"),
('<h2 className="font-serif', '<h2 id="cart-title" className="font-serif'),
('className="flex-1 overflow-y-auto scrollbar-thin p-5"','className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 sm:p-5" aria-busy={pending}'),
('className="p-1.5 hover:bg-gray-100 transition-colors"','disabled={pending}\n                              className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-40"'),
('className="p-2 text-gray-400 hover:text-red-500 transition-colors"','disabled={pending}\n                            className="w-11 h-11 flex items-center justify-center text-charcoal-light hover:text-red-600 disabled:opacity-40"'),
('onClick={onClose}\n                  className="w-full', 'onClick={event => { if(pending) event.preventDefault(); else onClose(); }}\n                  aria-disabled={pending}\n                  className="w-full'),
('onClick={handleClearCart}', 'disabled={pending}\n                  onClick={handleClearCart}'),
('<p className="text-xs text-charcoal-light">Shipping calculated at checkout</p>', '<p role="status" className="text-xs text-charcoal-light">{pending ? \'Updating your cart…\' : \'Shipping and tax calculated at checkout\'}</p>'),
('object-cover rounded-xl','object-contain rounded-xl'),
('flex items-center justify-between mt-2','flex flex-wrap items-center justify-between mt-2')])
