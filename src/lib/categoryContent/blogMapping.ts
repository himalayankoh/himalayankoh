import type { CategoryContentKey } from './keys';

export interface CategoryBlogMapping {
  /** Matches `blog_posts.category` values in Supabase. */
  blogCategories: string[];
  /** Matches `blog_posts.tags` (any overlap). */
  blogTags: string[];
  maxArticles: number;
}

/**
 * Maps each shop shelf to the editorial categories and tags whose posts belong
 * beside it.
 *
 * The livestock feeds that used to sit here (`Horse Care`, `Livestock Health`,
 * `Seasonal Care`) are replaced rather than kept as dead mappings: a mapping to a
 * category no post can carry would silently return nothing, which looks like a
 * broken hub rather than a retired one.
 */
export const CATEGORY_BLOG_MAPPING: Record<CategoryContentKey, CategoryBlogMapping> = {
  'edible-pink-salt': {
    blogCategories: ['Industry Insights', 'Research', 'Guides', 'Recipes'],
    blogTags: ['pink salt', 'edible salt', 'cooking', 'brining', 'salt'],
    maxArticles: 4,
  },
  'cooking-serving': {
    blogCategories: ['Guides', 'Recipes'],
    blogTags: ['salt block', 'serving', 'grilling', 'technique'],
    maxArticles: 4,
  },
  'licks-blocks': {
    // Deliberately empty, and not a placeholder to fill later by guessing: the
    // shelf was added with the owner's Salt Licks range, and no editorial category
    // exists for it yet. An empty mapping returns nothing rather than appearing to
    // be broken, which is the same reason the retired livestock mappings were
    // deleted instead of left dangling.
    blogCategories: [],
    blogTags: [],
    maxArticles: 0,
  },
  'live-stock': {
    blogCategories: [],
    blogTags: [],
    maxArticles: 0,
  },
  'lamps-decor': {
    blogCategories: ['Guides', 'Industry Insights'],
    blogTags: ['salt lamp', 'decor', 'home', 'care'],
    maxArticles: 4,
  },
  bulk: {
    blogCategories: ['Industry Insights', 'Guides'],
    blogTags: ['bulk', 'wholesale', 'storage', 'salt'],
    maxArticles: 4,
  },
};
