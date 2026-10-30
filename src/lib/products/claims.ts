/**
 * What product copy may not say.
 *
 * A rule, not a test helper: the store sells rock salt, so the copy that has to be
 * refused is a health claim the salt cannot support, a certification nobody issued,
 * or a guarantee nobody made. `listingDefects` surfaces it to whoever is editing the
 * catalog, and `productHonesty.test.ts` pins it for generated copy.
 *
 * What this module deliberately does **not** refuse
 * ------------------------------------------------
 * The previous version of this rule was a single denylist of animal words
 * (`livestock`, `horse`, `cattle`, `deer`, `ranch`) applied to every product
 * description. That was wrong twice over: it rejected the owner's own
 * salt lick and salt block products — the reason the business exists — and it
 * still let a fabricated certification through, because it was matching subject
 * matter rather than claims. A salt lick for horses is a farmer's product, not a
 * compliance problem; "FDA-approved, cures laminitis" is a compliance problem and
 * names no animal at all.
 *
 * So the patterns below match *claim shapes*. Words like horse, cattle, deer,
 * livestock, lick and block are legitimate throughout and are asserted as
 * *allowed* in `claims.test.ts`, because a false positive here silently blocks a
 * real product.
 */

export interface ProhibitedClaim {
  /** Which rule fired, for a message that explains itself. */
  rule: string;
  /** The exact text that matched. */
  match: string;
}

/**
 * Conditions and outcomes no salt product may promise to affect. Kept as a list
 * so a claim verb has to land near one of them, rather than banning the verb:
 * "treats" is a claim in "treats arthritis" and ordinary English in "treats
 * itself to a pinch of salt".
 */
const CONDITIONS = [
  'cancer', 'diabetes', 'diabetic', 'arthritis', 'hypertension', 'disease',
  'infection', 'illness', 'asthma', 'thyroid', 'goiter', 'goitre',
  'inflammation', 'acne', 'psoriasis', 'eczema', 'allergies', 'laminitis',
  'mastitis', 'milk fever', 'bloat', 'deficiency', 'electrolyte imbalance',
  'imbalance', 'toxins', 'free radicals', 'blood pressure', 'cholesterol',
  'insomnia', 'anxiety', 'depression', 'migraine', 'migraines',
].join('|');

interface ClaimRule {
  name: string;
  pattern: RegExp;
}

const RULES: ClaimRule[] = [
  {
    name: 'therapeutic claim',
    // A cure verb within 48 characters of a named condition.
    pattern: new RegExp(
      `\\b(?:cures?|curing|treats?|treating|heals?|healing|prevents?|preventing|reverses?|reversing|remedies|remedy|relieves?|relieving)\\b[^.;]{0,48}\\b(?:${CONDITIONS})\\b`,
      'i'
    ),
  },
  {
    name: 'therapeutic claim',
    // The same verbs aimed at a person or animal, with no condition named.
    pattern:
      /\b(?:cures?|curing|treats?|treating|heals?|healing|reverses?|reversing)\s+(?:you|your|yourself|them|their|anyone|everyone|animals?|your herd|the herd)\b/i,
  },
  {
    name: 'therapeutic claim',
    // Health benefits stated as anti-something or as a bodily effect.
    pattern:
      /\b(?:anti-?bacterial|anti-?viral|anti-?fungal|anti-?inflammatory|antiseptic|detox(?:es|ing|ify|ifies|ification)?|immune\s+(?:system\s+)?boost|boost(?:s|ing)?\s+(?:your\s+|the\s+)?immune|strengthen(?:s|ing)?\s+(?:your\s+|the\s+)?immune|kill(?:s|ing)?\s+(?:bacteria|germs|pathogens)|lower(?:s|ing)?\s+(?:your\s+|the\s+)?(?:blood pressure|cholesterol))\b/i,
  },
  {
    name: 'veterinary claim',
    // A veterinary authority being invoked.
    pattern: /\bveterinar(?:y|ian)[- ](?:approved|recommended|tested|certified|formulated)\b/i,
  },
  {
    name: 'fabricated certification',
    pattern:
      /\b(?:fda[- ]approved|fda[- ]certified|usda[- ](?:approved|certified)|certified\s+organic|usda\s+organic|non-?gmo\s+project|non-?gmo\s+verified|kosher\s+certified|halal\s+certified|iso[- ]?\d{3,5}\s+certified|lab[- ]tested|certified\s+purity)\b/i,
  },
  {
    name: 'unsupported guarantee',
    pattern:
      /\b(?:clinically\s+(?:proven|tested)|scientifically\s+proven|doctor[- ]recommended|guaranteed\s+(?:to\s+)?(?:cure|treat|prevent|heal)|100%\s+(?:safe|pure\s+and\s+natural|effective))\b/i,
  },
  {
    name: 'unsupported guarantee',
    pattern: /\bproven\s+to\s+(?:cure|treat|prevent|heal|lose\s+weight|detox)\b/i,
  },
];

/**
 * Every prohibited claim in `text`, with the rule and the matched words.
 *
 * Returns an empty array for absent/empty input: a product with no description has
 * nothing to refuse, which is a missing-copy problem handled elsewhere, not a
 * compliance one.
 */
export function findProhibitedClaims(text: string | null | undefined): ProhibitedClaim[] {
  if (!text) return [];

  const found: ProhibitedClaim[] = [];
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) found.push({ rule: rule.name, match: match[0].trim() });
  }
  return found;
}

/** True when the copy makes a claim the store cannot support. */
export function hasProhibitedClaim(text: string | null | undefined): boolean {
  return findProhibitedClaims(text).length > 0;
}

/** One-line reason suitable for a listing defect, or null when the copy is clean. */
export function prohibitedClaimReason(text: string | null | undefined): string | null {
  const [claim] = findProhibitedClaims(text);
  if (!claim) return null;
  return `Prohibited claim in copy (${claim.rule}): "${claim.match}"`;
}
