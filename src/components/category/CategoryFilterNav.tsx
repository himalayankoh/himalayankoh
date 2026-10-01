import { Link } from 'react-router-dom';
import { buildProductsCategoryPath, type CategoryFilterTab } from '../../lib/categoryContent';

interface Props {
  /** The selected `?category=` value, or `null` for All. */
  activeKey: string | null;
  /** The pills to show — already derived from the catalogue, with "All" first. */
  tabs: readonly CategoryFilterTab[];
}

/**
 * URL-driven category pills — deep links and browser history work out of the box.
 *
 * The pills come from `productsCategoryTabs(products)`, so they are the categories
 * the catalogue actually carries: a category with no products is not offered, and
 * a category the owner adds in WooCommerce appears without a code change. The
 * active pill is matched by key rather than label, so a newer WooCommerce category
 * cannot collide with a shelf by name.
 */
export default function CategoryFilterNav({ activeKey, tabs }: Props) {
  return (
    <div className="flex flex-wrap gap-2 w-full">
      {tabs.map((tab) => {
        const isActive = (tab.key ?? null) === (activeKey ?? null);
        const to = buildProductsCategoryPath(tab.key);

        return (
          <Link
            key={tab.key ?? tab.label}
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
