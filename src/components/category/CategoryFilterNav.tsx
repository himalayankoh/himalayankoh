import { Link } from 'react-router-dom';
import {
  CATEGORY_FILTER_TABS,
  buildProductsCategoryPath,
  productShelfKey,
} from '../../lib/categoryContent';
import type { Product } from '../../data/products';

interface Props {
  activeFilter: string;
  products: Product[];
}

/** URL-driven category pills — deep links and browser history work out of the box. */
export default function CategoryFilterNav({ activeFilter, products }: Props) {
  // A category pill with zero matching products is a dead end — the shopper
  // clicks it, lands on an empty grid, and bounces. "All" always shows.
  //
  // Visibility uses the same placement function the grid filters with, so a pill
  // that is shown always has something behind it, and one that would open empty
  // is not offered at all.
  const visibleTabs = CATEGORY_FILTER_TABS.filter((tab) => {
    if (!tab.key) return true;
    return products.some((product) => productShelfKey(product) === tab.key);
  });

  return (
    <div className="flex flex-wrap gap-2 w-full">
      {visibleTabs.map((tab) => {
        const isActive = activeFilter === tab.label;
        const to = buildProductsCategoryPath(tab.key);

        return (
          <Link
            key={tab.label}
            to={to}
            replace={false}
            className={`shrink-0 px-3 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
              isActive
                ? 'bg-himalayan-dark text-white'
                : 'bg-white text-charcoal hover:bg-himalayan-lighter border border-gray-200'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
