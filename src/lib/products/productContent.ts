import type { Product } from '../../data/products';
import { nicheSectionKeyFor, type NicheSectionKey } from '../catalog/nicheSections';

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface TrustIndicator {
  label: string;
  detail: string;
}

export interface ProductContent {
  displayName: string;
  metaTitle?: string;
  metaDescription?: string;
  useCases: string[];
  mineralHighlights: string[];
  shippingInfo: string[];
  trustIndicators: TrustIndicator[];
  faqs: ProductFaq[];
}

const SHARED_TRUST: TrustIndicator[] = [
  { label: '100% natural', detail: 'Unrefined rock salt with no anti-caking agents, bleaches, or additives.' },
  { label: 'Trace minerals', detail: 'Naturally occurring iron, potassium, magnesium, and calcium from ancient halite beds.' },
  { label: 'Houston distribution', detail: 'Stocked and inspected at our Texas distribution facility.' },
];

const SHARED_SHIPPING: string[] = [
  'Orders dispatch within 1–2 business days from our Houston, Texas facility.',
  'Carrier-calculated shipping rates at checkout based on package weight and destination.',
  'Bulk pallet freight and wholesale delivery available across the continental United States.',
];

/**
 * Content per shelf, keyed by the shelf taxonomy in `lib/catalog/niche.ts`.
 *
 * Keying on the shelf rather than on a raw `product.category` string means one
 * vocabulary for both sources: WooCommerce reports its own category names and
 * the bundled demo catalog reports the old labels, and both resolve to the same
 * shelf, so a product cannot pick up a different block depending on where it was
 * read from. A product that places on no shelf gets `GENERIC_DEFAULTS`.
 */
const SHELF_DEFAULTS: Record<NicheSectionKey, Omit<ProductContent, 'displayName' | 'metaTitle' | 'metaDescription'>> = {
  'edible-pink-salt': {
    useCases: [
      'Everyday cooking, grilling, and finishing dishes',
      'Brining meat and vegetables',
      'Salt grinders and table seasoning',
    ],
    mineralHighlights: [
      'Naturally pink color from iron and trace minerals',
      'Lower sodium perception with fuller mineral flavor',
      'Unprocessed crystals — no bleaching or chemical refining',
    ],
    shippingInfo: SHARED_SHIPPING,
    trustIndicators: [
      ...SHARED_TRUST,
      { label: 'Kosher-friendly', detail: 'Suitable for kitchens that prefer clean-label ingredients.' },
    ],
    faqs: [
      {
        question: 'Is this salt iodized?',
        answer:
          'Our Himalayan pink salt is not iodized. It delivers natural trace minerals without added iodine or anti-caking agents.',
      },
      {
        question: 'Which grain size should I choose?',
        answer:
          'Fine grain dissolves quickly for cooking and baking. Medium and coarse grains work well in grinders and finishing salt.',
      },
      {
        question: 'How should I store it?',
        answer: 'Keep in a cool, dry place in an airtight container. Avoid moisture to preserve texture.',
      },
    ],
  },
  'cooking-serving': {
    useCases: [
      'Cooking and searing on a heated salt block',
      'Chilling and serving cold plates, charcuterie and desserts',
      'Presenting food at the table on a natural salt surface',
    ],
    mineralHighlights: [
      'Solid unrefined salt, cut from the same rock as the edible grades',
      'Seasons the food that rests on it, gently and gradually',
      'Holds heat from the oven or grill and cold from the freezer',
    ],
    shippingInfo: [
      ...SHARED_SHIPPING,
      'Blocks and plates ship boxed and padded — the edges are the fragile part.',
    ],
    trustIndicators: [
      ...SHARED_TRUST,
      { label: 'Handle with care', detail: 'Wipe clean, never soak. A salt block is not a dishwasher item.' },
    ],
    faqs: [
      {
        question: 'How hot can a salt block get?',
        answer:
          'They are used in ovens and on grills, but they must be warmed gradually. Going from a cold block straight onto high heat is what cracks them.',
      },
      {
        question: 'How do I clean it?',
        answer:
          'Let it cool, then wipe with a damp cloth and scrape the surface clean. Never submerge a block in water or put it in a dishwasher.',
      },
      {
        question: 'Does the food become very salty?',
        answer:
          'It picks up a gentle salt edge, most on moist food left in contact longest. Move the food off the block when the seasoning tastes right.',
      },
    ],
  },
  'licks-blocks': {
    // Written to describe what the product *is* — a solid piece of pink salt sold
    // at a stated weight — and nothing about what it is for. The owner sells this
    // range; the storefront does not get to invent a use for it, and the retreat
    // from "livestock" framing makes a purpose claim the one thing worse than no
    // copy at all.
    useCases: [
      'Solid pink salt supplied in the weight the price list states',
      'Larger pieces for kitchens, workshops and volume buyers',
      'Pairs with our edible grades and salt blocks',
    ],
    mineralHighlights: [
      'Unrefined Himalayan pink salt, cut from the Khewra range',
      'Solid pieces rather than ground or powdered salt',
      'Packed at the weight shown on the product, not an approximate one',
    ],
    shippingInfo: [
      ...SHARED_SHIPPING,
      'Heavy pieces ship individually boxed so the corners arrive intact.',
      'Bulk quantities are quoted on request — ask before ordering a pallet.',
    ],
    trustIndicators: [
      ...SHARED_TRUST,
      { label: 'Weight as listed', detail: 'Sold at the weight the product states, so freight can be quoted accurately.' },
    ],
    faqs: [
      {
        question: 'What weight do these ship at?',
        answer:
          'The weight shown on the product line. Solid salt is heavy and the box is sized around it, so the shipping weight is close to the product weight.',
      },
      {
        question: 'Can I order in bulk?',
        answer:
          'Yes. Contact us with the quantity and we will quote it, including freight, before you order.',
      },
    ],
  },
  'live-stock': {
    useCases: ['Salt supplied in the bag or pouch size listed for the livestock range'],
    mineralHighlights: ['Unrefined Himalayan pink salt in the grain sizes shown on each product'],
    shippingInfo: SHARED_SHIPPING,
    trustIndicators: SHARED_TRUST,
    faqs: [],
  },
  'lamps-decor': {
    useCases: [
      'Warm amber light for a living room, bedroom or hallway',
      'A natural mineral piece on a shelf, console or bedside table',
      'Candle holders and carved décor',
    ],
    mineralHighlights: [
      'Hand-carved from pink salt — every piece keeps its own grain and colour',
      'No two lamps share the same veins or depth of shade',
      'Fitted with a dimmable cord where the product includes one',
    ],
    shippingInfo: [
      ...SHARED_SHIPPING,
      'Lamps ship in protective packing with the cord separately coiled.',
    ],
    trustIndicators: [
      ...SHARED_TRUST,
      { label: 'Dry rooms only', detail: 'Salt attracts moisture in humid air — leave the lamp lit and it dries itself.' },
    ],
    faqs: [
      {
        question: 'Why does my lamp feel damp?',
        answer:
          'Salt draws moisture from the air. Leave it lit for a few hours and the warmth drives it off; if the room stays humid, move the lamp somewhere drier.',
      },
      {
        question: 'How do I clean a salt lamp?',
        answer:
          'Wipe with a dry or barely damp cloth. Never wash it, and keep it away from running water and open windows in wet weather.',
      },
      {
        question: 'What bulb or cord does it take?',
        answer:
          'The fitting and cord are listed on the product; replacements for a failed bulb or cord usually come from any hardware store.',
      },
    ],
  },
  bulk: {
    useCases: [
      'Kitchens and bakeries that get through salt quickly',
      'Refilling retail jars and grinders from one bulk bag',
      'Shops and wholesale buyers ordering repeat quantities',
    ],
    mineralHighlights: [
      'The same unrefined salt as the retail jars, in larger packaging',
      'Keeps indefinitely while sealed and stored dry',
      'Available in fine and coarse grain',
    ],
    shippingInfo: [
      ...SHARED_SHIPPING,
      'Large bags ship via freight-friendly carriers — tracking provided at dispatch.',
    ],
    trustIndicators: [
      ...SHARED_TRUST,
      { label: 'Wholesale on request', detail: 'Recurring volumes and larger quantities are quoted on enquiry.' },
    ],
    faqs: [
      {
        question: 'How should I store a bulk bag?',
        answer:
          'Keep it closed, off a concrete floor and away from anything strongly scented. Decant into a small jar rather than leaving the bag open.',
      },
      {
        question: 'Does bulk salt go off?',
        answer:
          'No. Salt is a preservative — it does not spoil. It only takes on moisture or odours if it is left open in a damp or smelly place.',
      },
      {
        question: 'Do you offer wholesale pricing?',
        answer:
          'Yes — tell us the volume, the grain size and how often you need it, and we will quote the order.',
      },
    ],
  },
};

const SLUG_OVERRIDES: Record<string, Partial<ProductContent>> = {
  'himalayan-edible-pink-salt-fine': {
    displayName: 'Edible Pink Salt, Fine Grain',
    metaTitle: 'Edible Pink Salt, Fine Grain | Himalayan Koh',
    metaDescription:
      'Fine-grain Himalayan pink salt for everyday cooking. 84+ trace minerals, unrefined and additive-free. From $9.95 with free U.S. shipping over $50.',
    useCases: [
      'Daily cooking, baking, and brining',
      'Table salt and spice blends',
      'Meal prep and gourmet finishing',
    ],
  },
  'himalayan-pink-salt-16oz-jar': {
    displayName: 'Edible Pink Salt, 16 oz Jar',
    metaTitle: 'Pink Salt 16 oz Jar | Himalayan Koh',
    metaDescription:
      'Pantry-ready 16 oz jar of Himalayan pink salt. Clean flavor, 84+ minerals, fine or coarse options. $9.95 — shop edible salt online.',
  },
  'himalayan-rock-salt-6lbs-pouch': {
    displayName: 'Rock Salt Pouch, 6 lbs',
    metaTitle: 'Himalayan Rock Salt, 6 lb | Himalayan Koh',
    metaDescription:
      '6 lb pouch of Himalayan rock salt in fine or coarse grain. Ideal for kitchens and grinders. $17.95 with fast U.S. shipping.',
  },
  'himalayan-rock-salt-bag': {
    displayName: 'Himalayan Rock Salt, Bulk Bag',
    metaTitle: 'Bulk Himalayan Rock Salt | Himalayan Koh',
    metaDescription:
      'Bulk bag of unrefined Himalayan rock salt for kitchens and shops. Fine or coarse grain, packed to store dry. Order online from Himalayan Koh.',
    useCases: [
      'Refilling retail jars and grinders from one bag',
      'High-volume kitchens, bakeries and brining',
      'Wholesale and repeat orders',
    ],
  },
  'himalayan-salt-pouches': {
    displayName: 'Himalayan Pink Salt Pouches',
    metaTitle: 'Himalayan Pink Salt Pouches | Himalayan Koh',
    metaDescription:
      'Resealable pouches of unrefined Himalayan pink salt in fine and coarse grain. Keeps salt dry between refills. Shop from Himalayan Koh.',
  },
};

const GENERIC_DEFAULTS: Omit<ProductContent, 'displayName'> = {
  useCases: ['Cooking, seasoning, and natural mineral supplementation'],
  mineralHighlights: ['84+ trace minerals from ancient Himalayan deposits'],
  shippingInfo: SHARED_SHIPPING,
  trustIndicators: SHARED_TRUST,
  faqs: [
    {
      question: 'Where does Himalayan Koh salt come from?',
      answer:
        'Our salt is sourced from Himalayan deposits and selected for purity, mineral content, and consistent grain quality.',
    },
    {
      question: 'Do you offer bulk pricing?',
      answer: 'Yes — contact our team for quantity pricing on large orders.',
    },
  ],
};

type ContentBlocks = Omit<ProductContent, 'displayName'>;

function mergeContent(base: ContentBlocks, override?: Partial<ProductContent>): ContentBlocks {
  if (!override) return base;
  return {
    useCases: override.useCases ?? base.useCases,
    mineralHighlights: override.mineralHighlights ?? base.mineralHighlights,
    shippingInfo: override.shippingInfo ?? base.shippingInfo,
    trustIndicators: override.trustIndicators ?? base.trustIndicators,
    faqs: override.faqs ?? base.faqs,
    metaTitle: override.metaTitle ?? base.metaTitle,
    metaDescription: override.metaDescription ?? base.metaDescription,
  };
}

/** Readable short name for H1 and titles — avoids keyword-stuffed catalog names. */
export function getProductDisplayName(product: Product): string {
  const override = SLUG_OVERRIDES[product.slug]?.displayName;
  if (override) return override;

  let name = product.name
    .replace(/^Himalayan Koh\s+/i, '')
    .replace(/\b(Authentic|Pure Natural|Halal|Unprocessed)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const grainMatch = name.match(/,?\s*(Fine|Medium|Coarse)[^,)]*/i);
  if (name.length > 72 && grainMatch) {
    const short = name.split(/[,(]/)[0].trim();
    if (short.length >= 12 && short.length <= 72) name = `${short}${grainMatch[0]}`;
  }

  // Removing marketing words can leave a connector even without truncation.
  const cleanEnding = (title: string) => title
    .replace(/(?:[\s&,/|:;\-–—]+|\s+\b(?:and|or|with|for|of|to)\b)+$/gi, '')
    .trim();
  name = cleanEnding(name);

  if (name.length > 72) {
    let cut = name.slice(0, 69);
    // Avoid cutting a word in half; keep a whole final word when it fits.
    if (!/\s/.test(name[69]) && !/\s$/.test(cut)) {
      const boundary = cut.lastIndexOf(' ');
      if (boundary > 0) cut = cut.slice(0, boundary);
    }
    name = `${cleanEnding(cut)}…`;
  }

  return name || product.name;
}

export function getProductContent(product: Product): ProductContent {
  const slugOverride = SLUG_OVERRIDES[product.slug];
  // The shelf decides which block applies, so the copy follows the same
  // placement the shop grid and the hub pages use.
  const shelf = nicheSectionKeyFor(product);
  const categoryBase = (shelf ? SHELF_DEFAULTS[shelf] : null) ?? GENERIC_DEFAULTS;
  const merged = mergeContent(categoryBase, slugOverride);

  return {
    displayName: slugOverride?.displayName ?? getProductDisplayName(product),
    metaTitle: slugOverride?.metaTitle ?? merged.metaTitle,
    metaDescription: slugOverride?.metaDescription ?? merged.metaDescription,
    useCases: merged.useCases,
    mineralHighlights: merged.mineralHighlights,
    shippingInfo: merged.shippingInfo,
    trustIndicators: merged.trustIndicators,
    faqs: merged.faqs,
  };
}
