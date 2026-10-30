import { describe, expect, it } from 'vitest';
import {
  countOffNicheBlogPosts,
  filterNicheBlogPosts,
  isOffNicheBlogPost,
} from './nicheBlog';

describe('blog niche judgement', () => {
  it('excludes the livestock articles that were published for the old business', () => {
    // Real posts from the blog store — see docs/FRONTEND-CONTENT-AUDIT.md.
    expect(
      isOffNicheBlogPost({
        title: 'Why Do Dairy Cows Need Trace Minerals?',
        slug: 'why-dairy-cows-need-trace-minerals',
      })
    ).toBe(true);
    expect(
      isOffNicheBlogPost({
        title: 'Choosing the Right Salt Lick for Horses',
        slug: 'choosing-right-salt-lick-horses',
      })
    ).toBe(true);
  });

  it('keeps the pink-salt guides', () => {
    expect(
      isOffNicheBlogPost({
        title: 'Himalayan Pink Salt vs White Salt',
        slug: 'himalayan-pink-vs-white-salt-guide',
        excerpt: 'How unrefined pink salt differs from table salt, and where each belongs.',
      })
    ).toBe(false);
    expect(
      isOffNicheBlogPost({
        title: 'Fine, Medium or Coarse? Choosing a Grain Size',
        slug: 'choosing-grain-size',
        tags: ['cooking', 'brining'],
      })
    ).toBe(false);
  });

  it('reads tags and excerpts, not only the title', () => {
    expect(
      isOffNicheBlogPost({
        title: 'A complete guide to salt',
        slug: 'complete-guide-salt',
        tags: ['cattle', 'feed'],
      })
    ).toBe(true);
  });

  it('excludes an article whose title reads neutral but whose promise is livestock', () => {
    // The live blog store's third post is exactly this shape: a pink-vs-white salt
    // comparison written for farmers and ranchers, promising to explain the choice
    // "for their livestock". Its title alone would pass; the article would not.
    expect(
      isOffNicheBlogPost({
        title: 'Himalayan Pink Vs. White Salt – Why Farmers Are Switching',
        slug: 'himalayan-pink-vs-white-salt-farmers',
        excerpt:
          'Learn why more ranchers and farmers are choosing Himalayan pink salt over traditional white salt for their livestock.',
        tags: ['comparison', 'farmers', 'pink salt', 'white salt'],
      })
    ).toBe(true);
  });

  it('filters a mixed store and reports the withheld count', () => {
    const posts = [
      { title: 'Himalayan Pink Salt vs White Salt', slug: 'pink-vs-white' },
      { title: 'Why Do Dairy Cows Need Trace Minerals?', slug: 'dairy-cows' },
      { title: 'Salt for Livestock', slug: 'salt-for-livestock' },
    ];

    expect(filterNicheBlogPosts(posts).map((post) => post.slug)).toEqual(['pink-vs-white']);
    expect(countOffNicheBlogPosts(posts)).toBe(2);
  });

  it('survives posts with missing fields', () => {
    expect(isOffNicheBlogPost({})).toBe(false);
    expect(isOffNicheBlogPost({ title: null, slug: null, excerpt: null })).toBe(false);
  });

  it('matches whole words rather than substrings', () => {
    // "farmers" is not the livestock word "farm", so a slug that merely mentions
    // farmers is not enough on its own to hide an article.
    expect(
      isOffNicheBlogPost({
        title: 'Himalayan Pink Salt vs White Salt',
        slug: 'himalayan-pink-vs-white-salt-farmers',
      })
    ).toBe(false);
    // Words that merely contain a livestock word must not trip the filter either.
    expect(isOffNicheBlogPost({ title: 'Carpet-friendly salt storage' })).toBe(false);
    expect(isOffNicheBlogPost({ title: 'Petite salt cellars' })).toBe(false);
    expect(isOffNicheBlogPost({ title: 'Salt for cattle' })).toBe(true);
  });
});
