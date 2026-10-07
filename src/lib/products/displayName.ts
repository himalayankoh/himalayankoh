/**
 * Product display-name normalization — the one boundary every catalogue read passes.
 *
 * ## Why this lives here and not in a component
 *
 * The store's product names are the source of truth, and they were authored years
 * ago: several carry a trailing brand suffix (`- Himalayan Koh`) and write weights
 * as `lbs.` / `lbs` / `lb.`. The storefront must show a clean product name —
 * `Himalayan Rock Salt for Livestock (45 lb)` — but the store row, and therefore the
 * slug, must not change. A per-component `replace()` would be a display hack that
 * drifts the moment a second screen renders a name; normalizing once, where every
 * backend source (`mapStoreProduct`, `mapRestV3Product`) already funnels through
 * `buildProduct`, fixes the whole catalogue in one place.
 *
 * Slugs are never touched: `buildProduct` derives the slug from the raw store slug /
 * permalink before this runs, and this module never sees it.
 *
 * ## What is deliberately NOT done
 *
 * - No leading-brand stripping. The instruction is about a brand *appended* to the
 *   end; a name that happens to start with "Himalayan Koh" is left alone rather than
 *   guessed at.
 * - No prose rewriting. Only product names pass through here, so a description that
 *   mentions a weight is never silently edited.
 */

/**
 * A trailing brand suffix on the visible name: `- Himalayan Koh`, `| Himalayan Koh`,
 * with any dash flavour. Anchored to the end so a legitimate mid-name occurrence is
 * untouched.
 */
const TRAILING_BRAND = /\s*[-–—|]\s*Himalayan Koh\s*$/i;

/**
 * Weight units, reduced to the single house form `lb`:
 *   `45 lbs.` / `45 lbs` / `45 lb.` -> `45 lb`
 *
 * Only a unit that follows a number is rewritten, so `lbs` inside a word (there is no
 * such product token today, but the store is owner-editable) is left alone.
 */
export function normalizeWeightUnits(text: string): string {
  return (text ?? '')
    .replace(/(\d)\s*lbs\b\.?/gi, '$1 lb')
    .replace(/(\d)\s*lb\b\.?/gi, '$1 lb');
}

/**
 * Legacy store titles that need more than suffix-and-unit cleanup, keyed by their
 * stable slug. This is a migration shim for names written before the owner's current
 * naming standard; because it keys on the slug, it survives a title re-order and
 * disappears cleanly once the store row itself is renamed.
 */
const DISPLAY_TITLE_BY_SLUG: Record<string, string> = {
  // The owner's approved visible name for the 45 lb livestock salt.
  'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh':
    'Himalayan Rock Salt for Livestock (45 lb)',
};

/**
 * The visible product name: brand suffix removed, weight units standardized, and the
 * approved title applied where one is on file.
 *
 * Returns the trimmed input unchanged when there is nothing to do, so a clean name is
 * never rewritten into a different one.
 */
export function cleanProductName(name: string, slug?: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return trimmed;

  const approved = slug ? DISPLAY_TITLE_BY_SLUG[slug] : undefined;
  if (approved) return approved;

  return normalizeWeightUnits(trimmed.replace(TRAILING_BRAND, '').trim());
}
