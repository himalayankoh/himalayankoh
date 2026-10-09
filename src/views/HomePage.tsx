import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Truck, RotateCcw, Phone } from 'lucide-react';
import { legacyImage } from '@/lib/images/legacyAssets';
import type { Product } from '@/data/products';
import ProductCard from '@/components/ProductCard';
import { SkeletonProductCard } from '@/components/ui/Skeleton';
import { getCatalogProducts } from '@/lib/backend/catalogClient';
import { selectHomeFeatured } from '@/features/catalog/homeFeatured';

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


interface HomePageProps {
  /**
   * The featured cards the server already rendered, when it could read them.
   *
   * Present means the markup above is already on screen, so this component
   * renders it and issues no catalogue request of its own; the browser used to
   * fetch the same four products again immediately after hydration, which delayed
   * the first product photo on the shop's most-visited page. Absent means the
   * server read failed, and the client reads for itself so the page still works.
   */
  initialProducts?: Product[];
}

export default function HomePage({ initialProducts }: HomePageProps = {}) {
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialProducts);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The server already read the catalogue for this render; only a page that
    // arrived without it has anything to fetch.
    if (initialProducts) return;
    let active = true;
    getCatalogProducts().then(({ products }) => {
      if (!active) return;
      setProducts(selectHomeFeatured(products));
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialProducts]);
  return (
    <div className="bg-warm-white">
      <section className="border-b border-himalayan-line/60 bg-cream">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 grid lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-himalayan-dark mb-2">For your herd.</p>
            <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-charcoal leading-tight max-w-xl">Rich All Natural Himalayan Pink Salt</h1>
            <p className="mt-3 text-sm sm:text-base text-charcoal-light leading-relaxed max-w-xl">Ensure your herd is healthy and happy. Shop our convenient premium Himalayan Pink Salt products and enjoy friendly customer service from Himalayan Koh.</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link to="/products" className="btn-hk-primary">Shop all salt <ArrowRight size={17} className="ml-2" /></Link>
              <Link to="/about" className="btn-hk-ghost">Quality & sourcing</Link>
            </div>
            {/*
              The two shelves the live catalogue actually fills. This row used to
              offer "Salt licks & blocks", pointing at `licks-blocks` — a shelf the
              live install holds no product for, so the link opened an empty grid
              under a real heading. The owner's `animal feed` category is the
              livestock range, which is the Live Stock shelf; see `NICHE_SECTIONS`.
              The shelf returns to this row as soon as a product is filed under it.
            */}
            <nav aria-label="Shop by use" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-charcoal-light">
              <Link to="/products?category=live-stock" className="underline underline-offset-4 hover:text-himalayan-dark">Salt for livestock</Link>
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
          {loading ? Array.from({length:4},(_,i)=><SkeletonProductCard key={i}/>) : products.map((p,i)=><ProductCard key={p.id} product={p} index={i} priority={i === 0}/>)}
        </div>
        {!loading && !products.length && <p role="status" className="rounded-xl border border-himalayan-line p-6 text-charcoal-light">{failed ? 'Products could not be loaded right now.' : 'Explore available products in our catalogue.'} <Link to="/products" className="underline">Browse the shop</Link></p>}
      </section>
      <section className="bg-white border-t border-himalayan-line/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
            {/*
              This used to open with a culinary pitch — "For your kitchen. For your
              herd.", a "From kitchen to pasture" heading and a paragraph about top
              chefs — on a page whose catalogue is licks, blocks, bags and pouches.
              The owner asked for the kitchen marketing off the site, so the section
              now says only what the store actually sells for. Nothing here was
              rewritten to sell something else; the culinary half was removed.
            */}
            <div><h2 className="text-xl sm:text-2xl font-bold mb-3">From the Salt Range to your pasture</h2><div className="space-y-3 text-charcoal-light leading-relaxed">
              <p>Himalayan pink rock salt gives cattle, horses, deer, and other animals the quality NaCl they need to stay healthy and be more productive.</p>
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
