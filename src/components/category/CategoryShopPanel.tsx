import { ReactNode } from 'react';
import { Package } from 'lucide-react';
import { ORDERING_ENABLED } from '../../lib/storefront/ordering';

interface Props {
  categoryLabel: string;
  productCount: number;
  children: ReactNode;
}

/** Left column — clear “you are shopping products” chrome. */
export default function CategoryShopPanel({ categoryLabel, productCount, children }: Props) {
  return (
    <div className="rounded-2xl border-2 border-himalayan/25 bg-white shadow-lg shadow-himalayan/5 ring-1 ring-black/[0.04] overflow-hidden">
      <div className="bg-gradient-to-r from-himalayan/10 via-himalayan-lighter/50 to-white px-4 py-4 border-b border-himalayan/15">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-himalayan text-white shadow-md shadow-himalayan/30">
              <Package size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-himalayan">
                Shop products
              </p>
              <h2 className="font-serif text-lg font-bold text-charcoal leading-tight truncate">
                {categoryLabel}
              </h2>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-charcoal text-white text-xs font-bold px-3 py-1 tabular-nums">
            {productCount}
          </span>
        </div>
        <p className="text-xs text-charcoal-light mt-2 pl-14">
          {/*
            The subtitle describes what this shelf can actually do. It used to promise a
            cart on every shelf, including the deployment whose every cart control is
            disabled — measured on the catalogue-only launch, 2026-10-09. Same build-time
            constant the cards and the product page read, so the sentence and the buttons
            cannot disagree.
          */}
          {ORDERING_ENABLED
            ? 'Browse, add to cart, or open product details — same as our main store.'
            : 'Browse the range and open any product for its full details. Online ordering is temporarily unavailable — call or email us to place an order.'}
        </p>
      </div>
      <div className="p-4 md:p-5 space-y-5 bg-warm-white/50">{children}</div>
    </div>
  );
}
