import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Truck, RotateCcw, Phone } from 'lucide-react';
import { legacyImage } from '@/lib/images/legacyAssets';
import type { Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';
import { SkeletonProductCard } from '@/components/ui/Skeleton';
import { getCatalogProducts } from '@/lib/backend/catalogClient';

const saltBenefits = [
  'Naturally dense Himalayan rock salt provides essential sodium and chloride for horses, cattle, and livestock.',
  'Sodium and chloride are vital electrolytes required to maintain proper fluid balance and encourage normal feed intake.',
  'Solid rock salt licks withstand rain, wind, and pasture weathering significantly better than compressed salt blocks.',
  'Unrefined pink rock salt contains naturally occurring trace elements like iron, potassium, and magnesium with zero chemical binders.',
];

const healthCards = [
  {
    title: 'Essential Electrolyte Support',
    text: 'Sodium and chloride are fundamental nutrients required for normal osmotic balance, cellular function, and feed consumption.',
  },
  {
    title: 'Weather-Resistant Durability',
    text: 'Dense, natural crystal rock salt blocks resist dissolving in rain and humidity, reducing waste in outdoor pastures and paddocks.',
  },
  {
    title: 'Naturally Sourced Minerals',
    text: 'Mined from ancient geologic salt seams, our unrefined rock salt retains naturally occurring trace elements with zero added binders.',
  },
];


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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-himalayan-dark mb-2">For your kitchen. For your herd.</p>
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-charcoal leading-tight max-w-xl">Rich All Natural Himalayan Pink Salt</h1>
            <p className="mt-3 text-sm sm:text-base text-charcoal-light leading-relaxed max-w-xl">Ensure your herd is healthy and happy. Shop our convenient premium Himalayan Pink Salt products and enjoy friendly customer service from Himalayan Koh.</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link to="/products" className="btn-hk-primary">Shop all salt <ArrowRight size={17} className="ml-2" /></Link>
              <Link to="/quality" className="btn-hk-ghost">Quality & sourcing</Link>
            </div>
            <nav aria-label="Shop by use" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-charcoal-light">
              <Link to="/products?category=licks-blocks" className="underline underline-offset-4 hover:text-himalayan-dark">Salt licks & blocks</Link>
              <Link to="/products?category=edible-pink-salt" className="underline underline-offset-4 hover:text-himalayan-dark">Edible pink salt</Link>
            </nav>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <img src={legacyImage('horseLicking')} alt="Horse licking Himalayan salt" width={500} height={500} fetchPriority="high" className="aspect-[5/4] w-full rounded-xl object-cover" />
            <img src={legacyImage('bowlOfSalt')} alt="Bowls of Himalayan salt" width={500} height={500} decoding="async" className="aspect-[5/4] w-full rounded-xl object-cover" />
          </div>
        </div>
      </section>
      <nav aria-label="Shopping support" className="max-w-7xl mx-auto px-4 sm:px-6 grid sm:grid-cols-3 border-b border-himalayan-line/70 py-1 gap-x-6 text-sm text-charcoal-light">
        <Link to="/shipping" className="flex items-center gap-3 py-2"><Truck size={18} className="text-himalayan-dark" />Shipping & delivery details</Link>
        <Link to="/returns" className="flex items-center gap-3 py-2"><RotateCcw size={18} className="text-himalayan-dark" />Returns & eligibility</Link>
        <Link to="/contact" className="flex items-center gap-3 py-2"><Phone size={18} className="text-himalayan-dark" />Questions? Contact our team</Link>
      </nav>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8" aria-labelledby="home-collection">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div><p className="text-xs uppercase tracking-[0.16em] text-himalayan-dark mb-1">Explore the collection</p><h2 id="home-collection" className="text-xl sm:text-2xl font-bold">Salt for everyday use</h2></div>
          <Link to="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-himalayan-dark py-2">View all products <ArrowRight size={16} /></Link>
        </div>
        <div aria-busy={loading} className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {loading ? Array.from({length:4},(_,i)=><SkeletonProductCard key={i}/>) : products.map((p,i)=><ProductCard key={p.id} product={p} index={i}/>)}
        </div>
        {!loading && !products.length && <p role="status" className="rounded-xl border border-himalayan-line p-6 text-charcoal-light">{failed ? 'Products could not be loaded right now.' : 'Explore available products in our catalogue.'} <Link to="/products" className="underline">Browse the shop</Link></p>}
      </section>
      <section className="bg-white border-t border-himalayan-line/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
            <div><h2 className="text-xl sm:text-2xl font-bold mb-3">From kitchen to pasture</h2><div className="space-y-3 text-charcoal-light leading-relaxed">
              <p>Pristine pink Himalayan crystal salt has long been the premium standard for cooking. It&apos;s a favorite with top chefs and countless gourmet cooks. But livestock can also recognize and benefit from a better quality product.</p>
              <p>Himalayan pink rock salt not only tastes its salty best, but gives cattle, horses, deer, and other animals the quality NaCl they need to stay healthy and be more productive.</p>
              <Link to="/about" className="inline-flex py-2 items-center gap-2 text-himalayan-dark font-semibold">About Himalayan Koh <ArrowRight size={16}/></Link>
            </div></div>
            <ul className="space-y-2.5">{saltBenefits.map(b=><li key={b} className="flex gap-3 text-sm leading-relaxed text-charcoal-light"><Check size={18} className="shrink-0 text-himalayan-green mt-0.5"/>{b}</li>)}</ul>
          </div>
          <div className="mt-6 grid md:grid-cols-3 gap-5 border-t border-himalayan-line pt-6">{healthCards.map(c=><div key={c.title}><h3 className="text-base font-semibold mb-1">{c.title}</h3><p className="text-sm leading-relaxed text-charcoal-light">{c.text}</p></div>)}</div>
          <p className="mt-5 text-xs text-charcoal-light leading-relaxed max-w-4xl">*Nutritional Note: Free-choice salt licks supply vital dietary sodium and chloride. They are not a substitute for a tailored, complete livestock mineral and vitamin program. Always consult your veterinarian or animal nutritionist for herd-specific dietary formulation.</p>
        </div>
      </section>
    </div>
  );
}
