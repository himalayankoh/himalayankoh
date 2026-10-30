from pathlib import Path
import shutil
root=Path.cwd()
def read(p):
    f=root/p; b=root/'qa-visual-artifacts/premium-upgrade/source-before'/p
    if not b.exists(): b.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(f,b)
    return f.read_text(encoding='utf-8')
def write(p,s): (root/p).write_text(s,encoding='utf-8')
def replace(p,pairs):
    s=read(p)
    for a,b in pairs:
        if a not in s: raise Exception(f'Missing anchor {p}: {a[:70]}')
        s=s.replace(a,b)
    write(p,s)

p='src/views/HomePage.tsx'; s=read(p); arrays=s[s.index('const saltBenefits'):s.index('export default')]
write(p,'''import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Truck, RotateCcw, Phone } from 'lucide-react';
import { legacyImage } from '@/lib/images/legacyAssets';
import type { Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';
import { SkeletonProductCard } from '@/components/ui/Skeleton';
import { getCatalogProducts } from '@/lib/backend/catalogClient';

'''+arrays+'''
export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getCatalogProducts().then(({ products }) => {
      if (!active) return;
      const featured = products.filter(p => p.isFeatured);
      setProducts((featured.length ? featured : products).slice(0, 4));
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <div className="bg-warm-white">
      <section className="border-b border-himalayan-line/60 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16 grid lg:grid-cols-2 gap-8 lg:gap-14 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-himalayan-dark mb-4">For your kitchen. For your herd.</p>
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-charcoal leading-tight max-w-xl">Rich All Natural Himalayan Pink Salt</h1>
            <p className="mt-5 text-base sm:text-lg text-charcoal-light leading-relaxed max-w-xl">Ensure your herd is healthy and happy. Shop our convenient premium Himalayan Pink Salt products and enjoy friendly customer service from Himalayan Koh.</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link to="/products" className="btn-hk-primary">Shop all salt <ArrowRight size={17} className="ml-2" /></Link>
              <Link to="/quality" className="btn-hk-ghost">Quality & sourcing</Link>
            </div>
            <nav aria-label="Shop by use" className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-charcoal-light">
              <Link to="/products?category=licks-blocks" className="underline underline-offset-4 hover:text-himalayan-dark">Salt licks & blocks</Link>
              <Link to="/products?category=edible-pink-salt" className="underline underline-offset-4 hover:text-himalayan-dark">Edible pink salt</Link>
            </nav>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <img src={legacyImage('horseLicking')} alt="Horse licking Himalayan salt" width={500} height={500} fetchPriority="high" className="aspect-square w-full object-cover rounded-xl" />
            <img src={legacyImage('bowlOfSalt')} alt="Bowls of Himalayan salt" width={500} height={500} decoding="async" className="aspect-square w-full object-cover rounded-xl" />
          </div>
        </div>
      </section>
      <nav aria-label="Shopping support" className="max-w-7xl mx-auto px-4 sm:px-6 grid sm:grid-cols-3 border-b border-himalayan-line/70 py-3 gap-x-6 text-sm text-charcoal-light">
        <Link to="/shipping" className="flex items-center gap-3 py-3"><Truck size={18} className="text-himalayan-dark" />Shipping & delivery details</Link>
        <Link to="/returns" className="flex items-center gap-3 py-3"><RotateCcw size={18} className="text-himalayan-dark" />Returns & eligibility</Link>
        <Link to="/contact" className="flex items-center gap-3 py-3"><Phone size={18} className="text-himalayan-dark" />Questions? Contact our team</Link>
      </nav>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14" aria-labelledby="home-collection">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div><p className="text-xs uppercase tracking-[0.16em] text-himalayan-dark mb-2">Explore the collection</p><h2 id="home-collection" className="text-2xl sm:text-3xl font-bold">Salt for everyday use</h2></div>
          <Link to="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-himalayan-dark py-3">View all products <ArrowRight size={16} /></Link>
        </div>
        <div aria-busy={loading} className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {loading ? Array.from({length:4},(_,i)=><SkeletonProductCard key={i}/>) : products.map((p,i)=><ProductCard key={p.id} product={p} index={i}/>)}
        </div>
        {!loading && !products.length && <p role="status" className="rounded-xl border border-himalayan-line p-6 text-charcoal-light">{failed ? 'Products could not be loaded right now.' : 'Explore available products in our catalogue.'} <Link to="/products" className="underline">Browse the shop</Link></p>}
      </section>
      <section className="bg-white border-t border-himalayan-line/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-14">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-14">
            <div><h2 className="text-2xl sm:text-3xl font-bold mb-5">From kitchen to pasture</h2><div className="space-y-4 text-charcoal-light leading-relaxed">
              <p>Pristine pink Himalayan crystal salt has long been the premium standard for cooking. It&apos;s a favorite with top chefs and countless gourmet cooks. But livestock can also recognize and benefit from a better quality product.</p>
              <p>Himalayan pink rock salt not only tastes its salty best, but gives cattle, horses, deer, and other animals the quality NaCl they need to stay healthy and be more productive.</p>
              <Link to="/about" className="inline-flex py-2 items-center gap-2 text-himalayan-dark font-semibold">About Himalayan Koh <ArrowRight size={16}/></Link>
            </div></div>
            <ul className="space-y-4">{saltBenefits.map(b=><li key={b} className="flex gap-3 text-sm leading-relaxed text-charcoal-light"><Check size={18} className="shrink-0 text-himalayan-green mt-0.5"/>{b}</li>)}</ul>
          </div>
          <div className="mt-10 grid md:grid-cols-3 gap-6 border-t border-himalayan-line pt-8">{healthCards.map(c=><div key={c.title}><h3 className="text-lg font-semibold mb-2">{c.title}</h3><p className="text-sm leading-relaxed text-charcoal-light">{c.text}</p></div>)}</div>
          <p className="mt-8 text-xs text-charcoal-light leading-relaxed max-w-4xl">*Nutritional Note: Free-choice salt licks supply vital dietary sodium and chloride. They are not a substitute for a tailored, complete livestock mineral and vitamin program. Always consult your veterinarian or animal nutritionist for herd-specific dietary formulation.</p>
        </div>
      </section>
    </div>
  );
}
''')

replace('src/components/ProductCard.tsx',[
('const priceKnown = isPriceKnown(product);','const priceKnown = isPriceKnown(product);\n  const maxQuantity = typeof product.stockQuantity === \'number\' ? Math.max(0, product.stockQuantity) : null;\n  const canBuy = priceKnown && product.inStock && (maxQuantity === null || maxQuantity > 0);'),
('if (isAdding) return;','if (isAdding || !canBuy) return;'),
('className={`group bg-white rounded-2xl overflow-hidden transition-all duration-300 ${','className={`group flex flex-col min-w-0 bg-white rounded-xl overflow-hidden border border-himalayan-line/60 transition-shadow duration-150 ${'),
("'shadow-md shadow-black/5 hover:shadow-xl hover:shadow-himalayan/10'","'shadow-sm hover:shadow-md'"),
('object-cover group-hover:scale-110 transition-transform duration-700','object-contain motion-safe:group-hover:scale-[1.03] transition-transform duration-200'),
('className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100"','className="absolute top-2 right-2 flex gap-1 pointer-events-none opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"'),
('          <motion.button\n            whileHover={{ scale: 1.1 }}','          {onQuickView && <motion.button\n            whileHover={{ scale: 1.1 }}'),
('            <Eye size={18} />\n          </motion.button>','            <Eye size={18} />\n          </motion.button>}'),
('className="w-10 h-10 bg-white','className="pointer-events-auto w-11 h-11 bg-white'),
('onClick={handleWishlist}\n            className={`w-10 h-10','onClick={handleWishlist}\n            aria-label={`Save ${product.name} to wishlist`}\n            aria-pressed={wishlisted}\n            className={`pointer-events-auto w-11 h-11'),
('className="p-3.5 md:p-4"','className="p-3 md:p-4 flex flex-col flex-1 min-w-0"'),
('line-clamp-2 mb-1.5 min-h-10','mb-1.5 min-h-10 break-words'),
('value={selectedGrain}','aria-label={`Choose grain size for ${product.name}`}\n            value={selectedGrain}'),
('className="flex items-center gap-2">\n          <div','className="flex flex-wrap items-center gap-2 mt-auto">\n          <div'),
('onClick={() => setQty(Math.max(1, qty - 1))}','aria-label={`Decrease quantity for ${product.name}`}\n              disabled={qty <= 1 || isAdding}\n              onClick={() => setQty(Math.max(1, qty - 1))}'),
('onClick={() => setQty(qty + 1)}','aria-label={`Increase quantity for ${product.name}`}\n              disabled={isAdding || (maxQuantity !== null && qty >= maxQuantity)}\n              onClick={() => setQty(q => maxQuantity === null ? q + 1 : Math.min(q + 1, maxQuantity))}'),
('className="px-3 py-2 text-sm hover:bg-gray-100','className="min-h-11 min-w-9 px-2 py-2 text-sm disabled:opacity-40 hover:bg-gray-100'),
('disabled={!priceKnown || isAdding}','disabled={!canBuy || isAdding}\n            aria-live="polite"\n            aria-busy={isAdding}'),
('className={`flex-1 flex items-center','className={`w-full sm:w-auto flex-1 flex items-center'),
("(addedToCart ? 'Added!' : 'Add to Cart')","(addedToCart ? 'Added!' : !canBuy ? (product.stockStatus === 'out_of_stock' ? 'Out of stock' : 'Unavailable') : 'Add to Cart')")])
# Only the optional quick-view button is wrapped.
p='src/components/ProductCard.tsx';s=read(p);s=s.replace('{onQuickView && <motion.button\n            whileHover={{ scale: 1.1 }}\n            whileTap={{ scale: 0.9 }}\n            onClick={handleWishlist}', '<motion.button\n            whileHover={{ scale: 1.1 }}\n            whileTap={{ scale: 0.9 }}\n            onClick={handleWishlist}');write(p,s)

replace('src/views/ProductsPage.tsx',[("'bg-gradient-to-r from-charcoal to-charcoal-light py-20 md:py-28'","'bg-cream py-8 md:py-10 border-b border-himalayan-line'"),('text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-5','text-3xl sm:text-4xl font-bold text-charcoal mb-3'),('text-white/75 text-lg md:text-xl','text-charcoal-light text-base'),('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4','grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4'),('placeholder="Search products…"','aria-label="Search the catalogue"\n                placeholder="Search products…"')])
replace('src/components/category/CategoryFilterNav.tsx', [('flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:justify-center sm:overflow-visible scrollbar-thin','flex flex-wrap gap-2 w-full'),('shrink-0 px-5 py-2.5','shrink-0 px-3 py-2.5'),('bg-himalayan text-white shadow-lg shadow-himalayan/25','bg-himalayan-dark text-white')])
replace('src/components/ProductImageGallery.tsx', [('aspect-square bg-gray-50','aspect-[4/3] sm:aspect-square bg-white'),('object-cover','object-contain'),('w-10 h-10','w-11 h-11'),('images.length > 1','validImages.length > 1'),('images.map((_, idx)','validImages.map((_, idx)'),('className={`w-2 h-2 rounded-full transition-all ${','aria-pressed={idx === currentIndex}\n                className={`w-8 h-8 border-[10px] border-transparent bg-clip-content rounded-full transition-colors ${'),('bg-himalayan w-8','bg-himalayan-dark'),('{images.length}','{validImages.length}'),('transition={{ duration: 0.2 }}','transition={{ duration: 0.12 }}')])
