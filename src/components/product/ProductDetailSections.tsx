import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Gem, HelpCircle, UtensilsCrossed, ShieldAlert } from 'lucide-react';
import type { Product } from '../../data/products';
import { getProductContent } from '../../lib/products/productContent';
import ProductVideoSection from './ProductVideoSection';

interface Props {
  product: Product;
}

export default function ProductDetailSections({ product }: Props) {
  const content = getProductContent(product);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="mt-6 space-y-4">
      {/* Product Video — renders only when linked videos exist */}
      <ProductVideoSection product={product} />

      <section className="rounded-xl bg-white p-4 shadow-md shadow-black/5 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Gem size={20} className="text-himalayan" />
          <h2 className="font-serif text-xl font-bold text-charcoal">Mineral highlights</h2>
        </div>
        <ul className="grid sm:grid-cols-2 gap-3">
          {content.mineralHighlights.map((item) => (
            <li
              key={item}
              className="text-sm text-charcoal-light leading-relaxed pl-4 border-l-2 border-himalayan/30"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-md shadow-black/5 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <UtensilsCrossed size={20} className="text-himalayan" />
          <h2 className="font-serif text-xl font-bold text-charcoal">Use cases</h2>
        </div>
        <ul className="space-y-2">
          {content.useCases.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-charcoal-light">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-himalayan shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      {content.faqs.length > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-md shadow-black/5 sm:p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <HelpCircle size={20} className="text-himalayan" />
            <h2 className="font-serif text-xl font-bold text-charcoal">Frequently asked questions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {content.faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-4 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-medium text-charcoal text-sm md:text-base pr-2">
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-himalayan transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <p className="pb-4 text-sm text-charcoal-light leading-relaxed -mt-1">
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Compliance, Disclaimer & Resource Linking Section */}
      <section className="rounded-xl border border-gray-200/80 bg-warm-white p-4 space-y-3 sm:p-5 md:p-6">
        <div className="flex items-center gap-2 text-charcoal font-serif font-bold text-lg">
          <ShieldAlert className="w-5 h-5 text-himalayan flex-shrink-0" />
          <h2>Usage Guidelines & Nutritional Notice</h2>
        </div>
        <p className="text-sm text-charcoal-light leading-relaxed">
          Himalayan pink salt is unrefined halite rock salt composed primarily of sodium chloride with naturally occurring trace minerals (iron, potassium, magnesium, calcium). For animal salt licks: provide continuous access to fresh water. Salt licks do not substitute for a complete veterinary mineral program or forage balancing. For cooking slabs: heat gradually in stages to prevent thermal fractures.
        </p>
        <div className="pt-2 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs font-semibold">
          <Link to="/disclaimer" className="text-himalayan hover:underline">
            Product & Health Disclaimer →
          </Link>
          <Link to="/about" className="text-himalayan hover:underline">
            Quality & Sourcing Standards →
          </Link>
        </div>
      </section>
    </div>
  );
}
