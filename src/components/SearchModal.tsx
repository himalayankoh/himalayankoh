import { useEffect, useMemo, useRef, useState } from 'react';
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
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
