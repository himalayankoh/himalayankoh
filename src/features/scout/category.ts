/**
 * The Scout's category signal — one owner for a label that feeds three places:
 * a candidate's stored `category`, the deterministic score's demand criterion,
 * and the market-analysis prompt.
 *
 * It replaced a pet-species classifier (`Dog` / `Cat` / `Pet`) that described a
 * different business, which mattered beyond wording: the score awarded its
 * relevance points only to pet titles, so every Himalayan Koh candidate was
 * scored as if it had no category signal at all.
 *
 * Two rules keep this honest:
 *   - it reads only words the text actually contains, and
 *   - it returns `null` when there is no signal, rather than guessing a category
 *     from an unrelated product.
 */

/** The labels a title or query can be classified into. */
export type ScoutCategory = 'Himalayan Salt' | 'Salt Product';

/** The store's own niche. */
const NICHE = /himalayan|pink salt/i;

/** Salt in general, including mineral form. */
const GENERIC_SALT = /\bsalt\b|\bmineral\b|\bbrine\b/i;

/**
 * A concrete form within the niche — the second, separate demand signal.
 *
 * Deliberately excludes the bare word "salt" so it cannot award the same fact
 * twice alongside `hasNicheRelevance`: relevance is "this is my material",
 * a form is "this is a recognisable product made from it".
 */
const NICHE_FORM =
  /\b(?:lick|block|lamp|grain|coarse|fine|bath|culinary|edible|grinder|mill|scrub|soak|slab|crystal|chunk|shaker|dust|tealight|platter|tile|bulk|wholesale|livestock|horse|cattle|pouch|sack|bag|set)\b/i;

/**
 * The category signal in a title or a query, or null when there is none.
 *
 * A query of "dog toys" returns null, which is the truthful answer — that is
 * not what this store researches.
 */
export function saltCategoryFromText(text: string): ScoutCategory | null {
  const t = String(text || '').toLowerCase();
  if (NICHE.test(t)) return 'Himalayan Salt';
  if (GENERIC_SALT.test(t)) return 'Salt Product';
  return null;
}

/** True when the text names this store's material at all. */
export function hasNicheRelevance(text: string): boolean {
  const t = String(text || '');
  return NICHE.test(t) || GENERIC_SALT.test(t);
}

/** True when the text names a recognisable salt product form. */
export function hasNicheFormSignal(text: string): boolean {
  return NICHE_FORM.test(String(text || ''));
}
