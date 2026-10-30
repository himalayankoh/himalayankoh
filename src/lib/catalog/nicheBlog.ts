/**
 * Which articles belong on a Himalayan pink salt storefront.
 *
 * `lib/catalog/niche.ts` decides this for products; this is the same judgement for
 * editorial content, and it exists for the same reason. The old site published for
 * a livestock audience, and those posts are still in the blog store: listing them
 * under a pink-salt shop advertises horses and cattle, and the sitemap was handing
 * crawlers their URLs while the rest of the storefront had moved on.
 *
 * The test is deliberately conservative and narrow: a post is off-niche only when
 * its own words say so. "Himalayan pink salt and your horse's mineral intake" is
 * excluded; a cooking guide that happens to mention a steak is not.
 */

/** Words that mark an article as written for livestock, pets or the feed trade. */
const OFF_NICHE_TERMS = [
  'livestock',
  'cattle',
  'cow',
  'cows',
  'dairy',
  'horse',
  'horses',
  'equine',
  'pony',
  'deer',
  'elk',
  'goat',
  'sheep',
  'pig',
  'pigs',
  'swine',
  'poultry',
  'chicken',
  'chickens',
  'bird',
  'birds',
  'pet',
  'pets',
  'dog',
  'dogs',
  'cat',
  'cats',
  'animal',
  'animals',
  'farm',
  'herd',
  'ranch',
  'feed',
  'salt lick',
  'salt licks',
] as const;

/**
 * The words a post is judged on.
 *
 * Title, slug, excerpt and tags — the fields a listing actually shows. The body is
 * deliberately excluded: a salt-cooking article may mention that salt blocks are
 * also put out for animals, and excluding it for that would be wrong.
 */
export interface NicheBlogInput {
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  tags?: readonly string[] | null;
}

function haystack(post: NicheBlogInput): string {
  return [post.title ?? '', post.slug ?? '', post.excerpt ?? '', ...(post.tags ?? [])]
    .join(' ')
    .toLowerCase()
    .replace(/[-_/]+/g, ' ');
}

/**
 * Whole-word matchers, not substrings.
 *
 * Substring matching excluded real pink-salt content: the salt-versus-table-salt
 * guide has "farmers" in its slug, which is not the livestock word "farm". The
 * pattern is built once per term and reused.
 */
const OFF_NICHE_PATTERNS = OFF_NICHE_TERMS.map(
  (term) => new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`)
);

/** True when the article is written for the livestock/pet trade. */
export function isOffNicheBlogPost(post: NicheBlogInput): boolean {
  const text = haystack(post);
  return OFF_NICHE_PATTERNS.some((pattern) => pattern.test(text));
}

/** The storefront's articles: the source's list with off-niche posts removed. */
export function filterNicheBlogPosts<T extends NicheBlogInput>(posts: readonly T[]): T[] {
  return posts.filter((post) => !isOffNicheBlogPost(post));
}

/** How many posts a read withheld, for the warning the caller can report. */
export function countOffNicheBlogPosts(posts: readonly NicheBlogInput[]): number {
  return posts.filter(isOffNicheBlogPost).length;
}
