import { legacyImage } from '@/lib/images/legacyAssets';
import type { ResponsiveImageSources } from '@/lib/images/responsiveImage';

/**
 * The bundled catalog: Himalayan pink salt, and nothing else.
 *
 * This file is a *fallback*, not the shop. The live catalog is WooCommerce
 * (`lib/backend/products.ts`), and every guard about what the store sells is
 * applied there, to whatever the source reports. This module exists for two
 * narrow cases: local development with no backend configured, and the first paint
 * of a Supabase-source page whose read failed.
 *
 * It used to carry the store's livestock era — animal-feed products, their
 * categories, six ranch-industry blog posts and per-product testimonials. All of
 * it was removed rather than filtered at render time, because a bundled fallback
 * is copied into the visitor's browser: hiding a product inside a component still
 * ships its name, category and description to the page. What is not here cannot
 * leak.
 *
 * The five entries below are genuine pink salt products with the store's own
 * copy. Their commercial fields (price, stock) are demo values — the real ones
 * come from WooCommerce, and the storefront renders "unknown" rather than a
 * demo figure whenever the source cannot report them.
 */

/**
 * Stock state as reported by the catalog source.
 *
 * 'unknown' is a first-class value, not a fallback for a missing boolean: a
 * source that cannot report stock (the WordPress core product route, for
 * instance) must be able to say so instead of defaulting to in-stock.
 */
export type StockStatus = 'in_stock' | 'out_of_stock' | 'on_backorder' | 'unknown';

/**
 * The single product view model. Every catalog source maps into this shape;
 * nothing else may define a competing one.
 *
 * Commercial fields carry an explicit unknown:
 *  - `priceMin === null` means the source did not report a price. It is never
 *    defaulted to 0, and the display string in `price` is empty.
 *  - `sku` is null/absent when the source did not report one.
 *  - `stockStatus === 'unknown'` means the source could not report stock.
 * `missing` names the fields the source failed to supply so the UI can render
 * "unknown" deliberately rather than by accident.
 */

/**
 * One option a variable product actually sells.
 *
 * This is WooCommerce's own vocabulary rather than a second one of ours: `value`
 * is the term slug the store's cart expects (`coarse-grain`), `label` is what the
 * shopper reads (`Coarse Grain`), and `attribute` is the axis those two belong to
 * (`pa_grain-size`). A cart line has to name an option the store can price, so it
 * is addressed by the pair — never by anything the browser invented.
 */
export interface ProductVariationOption {
  /** The store's variation id. */
  id: number;
  /** The axis, as the store's cart names it: a global attribute's slug. */
  attribute: string;
  /** The option as the store names it, for display. */
  label: string;
  /** The option's value for the cart. */
  value: string;
  /** What this option costs, or null when the store reports no price for it. */
  price: number | null;
  sku: string | null;
  inStock: boolean;
}

/** The variation axis a shopper picks from, e.g. Grain Size. */
export interface ProductVariations {
  /** The axis's display name, e.g. `Grain Size`. */
  attributeLabel: string;
  options: ProductVariationOption[];
}

export interface Product {
  id: number | string;
  slug: string;
  name: string;
  /** Display string, e.g. "$9.95" or "$9.95 – $17.95". Empty when price is unknown. */
  price: string;
  /** True when `priceMin`..`priceMax` is a range across variants, not a discount. */
  priceRange?: boolean;
  isFeatured?: boolean;
  /** Lowest price, or null when the source reported no price. Never guessed. */
  priceMin: number | null;
  /** Top of the variant price range. Not a compare-at/discount price — see `priceRange`. */
  priceMax?: number;
  image: string;
  images?: string[];
  /**
   * The store's own responsive candidates for its images, keyed by image URL.
   *
   * Absent for a repo-hosted image (the curated defaults) and for any source
   * that does not publish a `srcset`, which is exactly when the plain `src` is
   * already the right thing to render. See `lib/images/responsiveImage.ts` for
   * what is kept and why. Keyed by URL rather than by index so it cannot drift
   * out of step with `images`.
   */
  imageResponsive?: ResponsiveImageSources;
  category: string;
  description?: string;
  grainSizes?: string[];
  /**
   * The store's real variation options, when the product is variable.
   *
   * `grainSizes` stays as well because it is the *display* form (the labels, and
   * what an order line prints); this is the *addressing* form (what the cart is
   * told). Both come from one read so they cannot disagree.
   */
  variations?: ProductVariations;
  inStock: boolean;
  metaTitle?: string;
  metaDescription?: string;
  /** SKU when the source reports one; null when it does not. */
  sku?: string | null;
  /** Stock as reported by the source. Absent on hand-written demo entries. */
  stockStatus?: StockStatus;
  /**
   * Units the source says are available, or null when it reports no count.
   *
   * The storefront caps a cart line at this figure instead of letting a customer
   * order past what the warehouse has. Null means "not reported" — the cart then
   * behaves as it did before, because inventing a ceiling is as wrong as
   * inventing stock.
   */
  stockQuantity?: number | null;
  /** Last modification time on the source, when it reports one. */
  updatedAt?: string | null;
  /** Catalog fields the source could not supply. Empty/absent means complete. */
  missing?: string[];
}

export interface GalleryImage {
  src: string;
  alt: string;
  category: string;
}

/** Bundled demo catalog — used only when Supabase env vars are not configured. */
export const products: Product[] = [
  {
    id: 1,
    slug: 'himalayan-edible-pink-salt-fine',
    name: "Himalayan Koh Authentic Pure Natural Halal Unprocessed Himalayan Edible Pink Cooking Salt, Fine Grain (0.5mm to 1mm)",
    price: "$9.95 – $17.95",
    priceRange: true,
    isFeatured: true,
    priceMin: 9.95,
    priceMax: 17.95,
    image: legacyImage('saltPouch6lb'),
    images: [legacyImage('saltPouch6lb'), legacyImage('bowlOfSalt'), legacyImage('pinkSaltJar16oz')],
    category: "Edible Cooking Salt",
    description: "Experience the pure essence of the Himalayas with our Authentic Pure Natural Halal Unprocessed Himalayan Edible Pink Cooking Salt, available in fine grain (0.5mm to 1mm). Our premium salt is 100% natural and completely unrefined – no additives, anti-caking agents, flow agents, or chemicals of any kind. Each crystal is rich in over 80 essential trace minerals including potassium, magnesium, calcium, and iron. Perfect for everyday cooking, gourmet recipes and wellness applications. Kosher certified and vegan friendly. Our fine grain salt dissolves quickly and blends seamlessly into any dish. Backed by our quality guarantee, this authentic Himalayan salt brings both flavor and nutrition to your table.",
    grainSizes: ["Fine (0.5mm-1mm)", "Medium (1mm-2mm)", "Coarse (2mm-5mm)"],
    inStock: true,
  },
  {
    id: 2,
    slug: 'himalayan-pink-salt-16oz-jar',
    name: "Himalayan Edible Pink Salt – 16 oz Jar",
    price: "$9.95",
    priceMin: 9.95,
    image: legacyImage('pinkSaltJar16oz'),
    category: "Edible Cooking Salt",
    description: "Our Himalayan Edible Pink Salt in a 16 oz glass jar is hand-selected and keeps its natural pink hue and mineral content. Ideal for everyday cooking, seasoning and table use. Use it to season vegetables, proteins and grains, or place it on your dining table for serving. Fine or coarse grain.",
    grainSizes: ["Fine", "Coarse"],
    inStock: true,
  },
  {
    id: 3,
    slug: 'himalayan-rock-salt-6lbs-pouch',
    name: "Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes – 6 lbs",
    price: "$17.95",
    priceMin: 17.95,
    image: legacyImage('saltRockBag'),
    category: "Edible Cooking Salt",
    description: "Our 6 lb Rock Salt Pouches come in both fine and coarse grain. The coarse grain works for salt-roasting vegetables and meats, while the fine grain dissolves quickly for everyday cooking. Sourced from ancient Himalayan deposits and processed to preserve purity.",
    grainSizes: ["Fine", "Coarse"],
    inStock: true,
  },
  {
    id: 13,
    slug: 'himalayan-pink-eidible-salt-fine-grain-pouche-6-pcs-box',
    name: 'Himalayan Pink Eidible Salt Fine Grain Pouche (6 pcs / box)',
    price: '$89.70',
    priceMin: 89.70,
    image: legacyImage('saltPouch6lb'),
    images: [legacyImage('saltPouch6lb'), legacyImage('bowlOfSalt')],
    category: 'Edible Cooking Salt',
    description: 'Fine-grain Himalayan pink edible salt supplied in 3 lb pouches, sold as a case of six. Use for cooking and seasoning. Natural pink shade may vary.',
    inStock: true,
    metaTitle: 'Himalayan Pink Edible Salt Fine Grain Pouch, 3 lbs | Himalayan Koh',
    metaDescription: 'Fine-grain Himalayan pink edible salt, sold as a 6-pouch case of 3 lb pouches.',
  },
  {
    id: 14,
    slug: 'himalayan-pink-eidible-salt-fine-grain-pouche-3-pcs-box',
    name: 'Himalayan Pink Eidible Salt Fine Grain Pouche (3 pcs / box)',
    price: '$19.95',
    priceMin: 19.95,
    image: legacyImage('saltPouch6lb'),
    images: [legacyImage('saltPouch6lb'), legacyImage('bowlOfSalt')],
    category: 'Edible Cooking Salt',
    description: 'Fine-grain Himalayan pink edible salt supplied in a 6 lb pouch. Use for cooking and seasoning. Natural pink shade may vary.',
    inStock: true,
    metaTitle: 'Himalayan Pink Edible Salt Fine Grain Pouch, 6 lbs | Himalayan Koh',
    metaDescription: 'Fine-grain Himalayan pink edible salt, 6 lb pouch. $19.95.',
  },
  {
    id: 2484,
    slug: 'himalayan-salt-block-30-lbs',
    name: 'Himalayan Salt Block — 30 lbs',
    price: '$49.95',
    priceMin: 49.95,
    sku: 'HK-LB-30LBS',
    image: '/images/products/himalayan-salt-block-30lbs-hero.webp',
    images: [
      '/images/products/himalayan-salt-block-30lbs-hero.webp',
      '/images/products/himalayan-salt-block-30lbs-horse.webp',
      '/images/products/himalayan-salt-block-30lbs-cow.webp',
      '/images/products/himalayan-salt-block-30lbs-livestock.webp',
    ],
    category: 'Salt Blocks',
    description: 'Natural 30 lb pure pink Himalayan rock salt block, rich in 84+ essential trace minerals for horses, cattle, and livestock. Completely unrefined and additive-free.',
    inStock: true,
    stockStatus: 'in_stock',
    stockQuantity: 10,
    metaTitle: 'Himalayan Salt Block 30 lbs | Himalayan Koh',
    metaDescription: 'Natural 30 lb pure pink Himalayan rock salt block with essential trace minerals for horses and cattle.',
  },
  {
    id: 2489,
    slug: 'himalayan-salt-lick-30-lbs',
    name: 'Himalayan Salt Lick — 30 lbs',
    price: '$39.95',
    priceMin: 39.95,
    sku: 'HK-LFH-30lbs',
    image: '/images/products/himalayan-salt-block-30lbs-hero.webp',
    images: [
      '/images/products/himalayan-salt-block-30lbs-hero.webp',
      '/images/products/himalayan-salt-block-30lbs-horse.webp',
      '/images/products/himalayan-salt-block-30lbs-cow.webp',
      '/images/products/himalayan-salt-block-30lbs-livestock.webp',
    ],
    category: 'Salt Licks',
    description: 'Natural 30 lb Himalayan pink rock salt lick containing essential trace minerals for horses and livestock. Weather-resistant solid crystalline rock salt.',
    inStock: true,
    stockStatus: 'in_stock',
    stockQuantity: 10,
    metaTitle: 'Himalayan Salt Lick 30 lbs | Himalayan Koh',
    metaDescription: 'Natural 30 lb pure Himalayan rock salt lick for horses, cattle, and livestock.',
  },
  {
    id: 2486,
    slug: 'himalayan-salt-lick-3-to-4-lbs',
    name: 'Himalayan Salt Lick — 3 to 4 lbs',
    price: '$14.95',
    priceMin: 14.95,
    sku: 'HK-LFH-4lbs',
    image: '/images/products/himalayan-salt-lick-rope-hero.webp',
    images: [
      '/images/products/himalayan-salt-lick-rope-hero.webp',
      '/images/products/himalayan-salt-lick-rope-front.webp',
      '/images/products/himalayan-salt-lick-rope-horse.webp',
      '/images/products/himalayan-salt-lick-rope-angle.webp',
      '/images/products/himalayan-salt-lick-rope-label.webp',
    ],
    category: 'Salt Licks',
    description: 'Natural 3 to 4 lb Himalayan pink rock salt lick with rope, containing all essential trace minerals for horses, cattle, and livestock. Drilled hole with durable hanging rope.',
    inStock: true,
    stockStatus: 'in_stock',
    stockQuantity: 10,
    metaTitle: 'Himalayan Salt Lick with Rope 3–4 lbs | Himalayan Koh',
    metaDescription: 'Natural 3 to 4 lb Himalayan pink rock salt lick with hanging rope and essential trace minerals.',
  },
  {
    id: 2487,
    slug: 'himalayan-salt-lick-5-to-6-lbs',
    name: 'Himalayan Salt Lick — 5 to 6 lbs',
    price: '$19.95',
    priceMin: 19.95,
    sku: 'HK-LFH-6lbs',
    image: '/images/products/himalayan-salt-lick-rope-hero.webp',
    images: [
      '/images/products/himalayan-salt-lick-rope-hero.webp',
      '/images/products/himalayan-salt-lick-rope-front.webp',
      '/images/products/himalayan-salt-lick-rope-horse.webp',
      '/images/products/himalayan-salt-lick-rope-angle.webp',
      '/images/products/himalayan-salt-lick-rope-label.webp',
    ],
    category: 'Salt Licks',
    description: 'Natural 5 to 6 lb Himalayan pink rock salt lick with rope, containing all essential trace minerals for horses, cattle, and livestock. Drilled hole with durable hanging rope.',
    inStock: true,
    stockStatus: 'in_stock',
    stockQuantity: 10,
    metaTitle: 'Himalayan Salt Lick with Rope 5–6 lbs | Himalayan Koh',
    metaDescription: 'Natural 5 to 6 lb Himalayan pink rock salt lick with hanging rope and essential trace minerals.',
  },
];

/**
 * The bundled catalog *is* the storefront catalog.
 *
 * There is no filter call here any more, and that is the point: the entries above
 * are in-niche by construction, so this module needs no denylist and cannot ship
 * one to the browser. The guard still runs on every live read, in
 * `lib/backend/products.ts`, which is where an off-niche record can actually
 * arrive from.
 */
export const storefrontProducts: Product[] = products;

export const galleryImages: GalleryImage[] = [
  {
    src: legacyImage('bowlOfSalt'),
    alt: "Coarse pink Himalayan salt in a bowl",
    category: "Edible Pink Salt",
  },
  {
    src: legacyImage('pinkSaltJar16oz'),
    alt: "Jar of pink Himalayan table salt",
    category: "Edible Pink Salt",
  },
  {
    src: legacyImage('saltPouch6lb'),
    alt: "Resealable pouch of pink Himalayan salt",
    category: "Edible Pink Salt",
  },
  {
    src: legacyImage('saltRockBag'),
    alt: "Bulk bag of Himalayan rock salt",
    category: "Bulk & Wholesale",
  },
];

/** "All" plus the shelves that actually have a photograph. */
export const galleryCategories: string[] = [
  'All',
  ...Array.from(new Set(galleryImages.map((image) => image.category))),
];
