import { legacyImage } from '@/lib/images/legacyAssets';
import type { BlogPostWithAuthor } from '@/lib/blog/types';
import { CATEGORY_BLOG_MAPPING } from './blogMapping';
import { enrichArticleList, stripHtmlToText } from './enrichArticle';
import type { CategoryContentKey } from './keys';
import type { CategoryArticleCard } from './types';

const DEFAULT_ARTICLE_IMAGE = legacyImage('bowlOfSalt');

export function mapBlogPostToCategoryArticle(post: BlogPostWithAuthor): CategoryArticleCard {
  const excerpt = post.excerpt?.trim() || 'Read the full article on the Himalayan Koh blog.';
  const fromContent = post.content ? stripHtmlToText(post.content) : '';
  const body = fromContent.length > excerpt.length ? fromContent.slice(0, 520) : undefined;

  return enrichArticleList([
    {
      id: post.id,
      title: post.title,
      excerpt,
      body,
      image: post.featured_image || DEFAULT_ARTICLE_IMAGE,
      readTime: `${post.read_time} min read`,
      tag: post.category || 'Article',
      href: `/blog/${post.slug}`,
    },
  ])[0];
}

function mergeWithPlaceholders(
  primary: CategoryArticleCard[],
  placeholders: CategoryArticleCard[],
  max: number
): CategoryArticleCard[] {
  const seen = new Set<string>();
  const merged: CategoryArticleCard[] = [];

  for (const article of primary) {
    if (merged.length >= max) break;
    seen.add(article.id);
    merged.push(article);
  }

  for (const article of placeholders) {
    if (merged.length >= max || seen.has(article.id)) continue;
    seen.add(article.id);
    merged.push(article);
  }

  return merged;
}

/**
 * Load published blog posts for a shop category hub.
 *
 * Two sources, in order: the blog store, then the hub's own editorial registry,
 * which is real pink-salt copy maintained with the shelf.
 *
 * There used to be a third: a bundled corpus of ranch-industry posts mapped onto
 * the shelves. It is gone. Those posts were written for a livestock audience, and
 * a hub that answered an empty blog query with "how to choose a salt lick for your
 * horses" was advertising a niche the store had left — on a page whose whole job
 * is to say what the shelf is for. A shelf with no published article now falls
 * back to its own guides, and if it has none it says so.
 *
 * The blog store is read through `/api/blog/articles`, not a database client: this
 * module is reachable from the storefront shell (the footer links the hub pages,
 * which pull it in through `./index`), so a client import here was downloaded by
 * every page in the `(main)` group. `isSupabaseConfigured` is gone with it — it
 * only ever gated that read, and an absent blog is answered by the fallback below
 * rather than by asking whether a database exists.
 */
export async function loadCategoryArticles(
  key: CategoryContentKey,
  placeholderArticles: CategoryArticleCard[]
): Promise<{ articles: CategoryArticleCard[]; source: 'blog' | 'placeholder' }> {
  const mapping = CATEGORY_BLOG_MAPPING[key];

  try {
    const query = new URLSearchParams({
      categories: mapping.blogCategories.join(','),
      tags: mapping.blogTags.join(','),
      limit: String(mapping.maxArticles),
    });
    const response = await fetch(`/api/blog/articles?${query}`);
    const body = response.ok
      ? ((await response.json()) as { posts?: BlogPostWithAuthor[] })
      : {};
    const posts = body.posts ?? [];

    if (posts.length > 0) {
      const blogCards = posts.map(mapBlogPostToCategoryArticle);
      return {
        articles: enrichArticleList(
          mergeWithPlaceholders(blogCards, placeholderArticles, mapping.maxArticles)
        ),
        source: 'blog',
      };
    }
  } catch (error) {
    console.warn('Category blog fetch failed, using fallbacks:', error);
  }

  return {
    articles: enrichArticleList(placeholderArticles.slice(0, mapping.maxArticles)),
    source: 'placeholder',
  };
}
