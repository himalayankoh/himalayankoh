export interface BoxDimensions {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

export interface PackingRule {
  id: string;
  label: string;
  unitWeightLbs: number;
  unitsPerBox: number;
  box: BoxDimensions;
  /** Checked before pattern matching — exact slug → rule id */
  slugs?: string[];
  /** First matching rule wins; checked in array order */
  matches: (product: { slug: string; name: string }) => boolean;
}

/**
 * The one approved standard parcel for both salt licks, as the owner specified it.
 *
 * The 2 lb and the 6 lb lick use the same box; only how many fit in it differs. The
 * 6 lb lick was on a 9.5 x 9.5 x 5.5 carton at 4 per box, which is not the approved
 * box, so its rated dimensions did not match the box that actually goes out.
 */
const BOX_10_10_6: BoxDimensions = { lengthIn: 10, widthIn: 10, heightIn: 6 };
const BOX_30_BLOCK: BoxDimensions = { lengthIn: 8.5, widthIn: 7.5, heightIn: 6.5 };
const BOX_BAG_18: BoxDimensions = { lengthIn: 10, widthIn: 10, heightIn: 8 };
const BOX_BAG_45: BoxDimensions = { lengthIn: 12, widthIn: 10, heightIn: 8 };

function hasLb(text: string, pounds: number): boolean {
  const normalized = text.toLowerCase();
  const lb = `${pounds}\\s*(-|\\s)?lb`;
  const oz = pounds === 1 ? '16\\s*(-|\\s)?oz' : null;
  return new RegExp(`\\b(${lb}${oz ? `|${oz}` : ''})\\b`, 'i').test(normalized);
}

function hasLick(text: string): boolean {
  return /\blick(s)?\b/i.test(text);
}

function hasPouch(text: string): boolean {
  return /\bpouch(es)?\b/i.test(text);
}

function hasBlock(text: string): boolean {
  return /\bblock(s)?\b/i.test(text);
}

function hasJar(text: string): boolean {
  return /\bjar(s)?\b/i.test(text);
}

/**
 * Active Shippo packing rules — only these products get live carrier parcel math.
 * Order matters: more specific rules must appear first.
 */
/** Explicit catalog slug → packing rule id (for products without size in the title). */
export const SLUG_PACKING_RULE_IDS: Record<string, string> = {
  'himalayan-salt-licks-horses': 'lick-2lb',
  'himalayan-6lb-trace-mineral-salt-block': 'block-6lb',
  'himalayan-2lb-round-rope-salt-lick': 'round-rope-lick-2lb',
  'himalayan-6lb-round-rope-salt-lick': 'round-rope-lick-6lb',
  'himalayan-pink-salt-16oz-jar': 'jar-1lb-edible',
  'himalayan-rock-salt-6lbs-pouch': 'pouch-6lb-fine',
  'himalayan-edible-pink-salt-fine': 'pouch-6lb-fine',
  'himalayan-livestock-salt-45lbs': 'bag-45lb',
  'himalayan-salt-cattle-18lbs': 'bag-18lb',
};

export const ACTIVE_PACKING_RULES: PackingRule[] = [
  {
    id: 'round-rope-lick-2lb',
    label: '2 lb round rope licks',
    unitWeightLbs: 2,
    unitsPerBox: 4,
    box: BOX_10_10_6,
    slugs: ['himalayan-2lb-round-rope-salt-lick'],
    matches: ({ slug }) => slug === 'himalayan-2lb-round-rope-salt-lick',
  },
  {
    id: 'round-rope-lick-6lb',
    label: '6 lb round rope licks',
    unitWeightLbs: 6,
    unitsPerBox: 1,
    box: BOX_10_10_6,
    slugs: ['himalayan-6lb-round-rope-salt-lick'],
    matches: ({ slug }) => slug === 'himalayan-6lb-round-rope-salt-lick',
  },
  {
    id: 'block-6lb',
    label: '6 lb salt blocks',
    unitWeightLbs: 6,
    unitsPerBox: 1,
    box: BOX_10_10_6,
    slugs: ['himalayan-6lb-trace-mineral-salt-block'],
    matches: ({ slug }) => slug === 'himalayan-6lb-trace-mineral-salt-block',
  },
  {
    id: 'jar-1lb-edible',
    label: '1 lb jar fine grain edible',
    unitWeightLbs: 1,
    unitsPerBox: 9,
    box: BOX_10_10_6,
    slugs: ['himalayan-pink-salt-16oz-jar'],
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasJar(text) && (hasLb(text, 1) || /16\s*oz/i.test(text));
    },
  },
  {
    id: 'lick-2lb',
    label: '2 lb licks',
    unitWeightLbs: 2,
    unitsPerBox: 6,
    box: BOX_10_10_6,
    slugs: ['himalayan-salt-licks-horses'],
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 2) && hasLick(text) && !hasPouch(text) && !hasBlock(text);
    },
  },
  {
    id: 'lick-4lb',
    label: '4 lb licks',
    unitWeightLbs: 4,
    unitsPerBox: 4,
    box: BOX_10_10_6,
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 4) && hasLick(text) && !hasPouch(text) && !hasBlock(text);
    },
  },
  {
    id: 'lick-6lb',
    label: '6 lb licks',
    unitWeightLbs: 6,
    unitsPerBox: 4,
    box: BOX_10_10_6,
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 6) && hasLick(text) && !hasPouch(text) && !hasBlock(text);
    },
  },
  {
    id: 'block-30lb',
    label: '30 lb block',
    unitWeightLbs: 30,
    unitsPerBox: 1,
    box: BOX_30_BLOCK,
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return (
        hasLb(text, 30) &&
        !hasPouch(text) &&
        !hasJar(text) &&
        !/\bbag\b/i.test(text) &&
        (hasBlock(text) || /\b30\s*(-|\s)?lb\b/i.test(text))
      );
    },
  },
  {
    id: 'pouch-3lb-fine',
    label: '3 lb fine grain pouches',
    unitWeightLbs: 3,
    unitsPerBox: 6,
    box: BOX_10_10_6,
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 3) && hasPouch(text);
    },
  },
  {
    id: 'pouch-6lb-fine',
    label: '6 lb fine grain pouches',
    unitWeightLbs: 6,
    unitsPerBox: 3,
    box: BOX_10_10_6,
    slugs: ['himalayan-rock-salt-6lbs-pouch', 'himalayan-edible-pink-salt-fine'],
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 6) && hasPouch(text);
    },
  },
  {
    id: 'bag-18lb',
    label: '18 lb bag',
    unitWeightLbs: 18,
    unitsPerBox: 1,
    box: BOX_BAG_18,
    slugs: ['himalayan-salt-cattle-18lbs'],
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 18) && /\bbag\b/i.test(text);
    },
  },
  {
    id: 'bag-45lb',
    label: '45 lb bag',
    unitWeightLbs: 45,
    unitsPerBox: 1,
    box: BOX_BAG_45,
    slugs: ['himalayan-livestock-salt-45lbs'],
    matches: ({ slug, name }) => {
      const text = `${slug} ${name}`;
      return hasLb(text, 45) && /\bbag\b/i.test(text);
    },
  },
];

const rulesById = new Map(ACTIVE_PACKING_RULES.map((rule) => [rule.id, rule]));

export function resolvePackingRule(product: {
  slug: string;
  name: string;
  weightLbs?: number | null;
}): PackingRule | null {
  const slugKey = product.slug.trim().toLowerCase();
  const mappedRuleId = SLUG_PACKING_RULE_IDS[slugKey];
  if (mappedRuleId) {
    const mapped = getPackingRuleById(mappedRuleId);
    if (mapped) return mapped;
  }

  for (const rule of ACTIVE_PACKING_RULES) {
    if (rule.slugs?.some((slug) => slug.toLowerCase() === slugKey)) {
      return rule;
    }
  }

  if (product.weightLbs && product.weightLbs > 0) {
    const weight = Math.round(product.weightLbs);
    const text = `${product.slug} ${product.name}`;

    if (hasLick(text) && !hasPouch(text) && !hasBlock(text)) {
      if (weight === 2) return getPackingRuleById('lick-2lb') ?? null;
      if (weight === 4) return getPackingRuleById('lick-4lb') ?? null;
      if (weight === 6) return getPackingRuleById('lick-6lb') ?? null;
    }
    if (hasPouch(text)) {
      if (weight === 3) return getPackingRuleById('pouch-3lb-fine') ?? null;
      if (weight === 6) return getPackingRuleById('pouch-6lb-fine') ?? null;
    }
    if (hasJar(text) && weight === 1) return getPackingRuleById('jar-1lb-edible') ?? null;
    if (hasBlock(text) && weight === 30) return getPackingRuleById('block-30lb') ?? null;
    if (/\bbag\b/i.test(text)) {
      if (weight === 45) return getPackingRuleById('bag-45lb') ?? null;
      if (weight === 18) return getPackingRuleById('bag-18lb') ?? null;
    }
    return pickRuleByWeightOnly(weight);
  }

  for (const rule of ACTIVE_PACKING_RULES) {
    if (rule.matches(product)) {
      return rule;
    }
  }

  return null;
}

/** Closest approved box when only product weight is known (legacy listings). */
function pickRuleByWeightOnly(weightLbs: number): PackingRule | null {
  const weight = Math.round(weightLbs);
  const byWeight: Record<number, string> = {
    1: 'jar-1lb-edible',
    2: 'lick-2lb',
    3: 'pouch-3lb-fine',
    4: 'lick-4lb',
    6: 'pouch-6lb-fine',
    18: 'bag-18lb',
    30: 'block-30lb',
    45: 'bag-45lb',
  };

  if (byWeight[weight]) {
    return getPackingRuleById(byWeight[weight]) ?? null;
  }

  if (weight <= 2) return getPackingRuleById('lick-2lb') ?? null;
  if (weight <= 4) return getPackingRuleById('lick-4lb') ?? null;
  if (weight <= 6) return getPackingRuleById('pouch-6lb-fine') ?? null;
  if (weight <= 30) return getPackingRuleById('block-30lb') ?? null;
  return getPackingRuleById('bag-45lb') ?? null;
}

export function getPackingRuleById(id: string): PackingRule | undefined {
  return rulesById.get(id);
}
