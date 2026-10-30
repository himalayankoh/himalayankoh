import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface Props {
  /** The selected `?category=` value; used only to key the transition. */
  categoryKey: string | null;
  products: ReactNode;
  education: ReactNode;
}

/**
 * Split commerce + education layout for /products category hubs.
 * Mobile: products first, education below. Desktop: left ~35% products, right ~65% education.
 */
export default function CategoryHubLayout({ categoryKey, products, education }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 lg:gap-12 items-start">
      <motion.div
        key={`products-${categoryKey ?? 'all'}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="md:col-span-5 lg:col-span-4 space-y-6"
      >
        {products}
      </motion.div>

      <motion.div
        key={`education-${categoryKey ?? 'all'}`}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
        className="md:col-span-7 lg:col-span-8 border-t border-gray-200/80 pt-8 md:border-t-0 md:pt-0"
      >
        {education}
      </motion.div>
    </div>
  );
}
