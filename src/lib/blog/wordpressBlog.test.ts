import { describe, expect, it } from 'vitest';
import { blogPostFromWp } from './wordpressBlog';

/**
 * The mapping is the part worth testing: it is where a WordPress post becomes the
 * shape every screen renders, and where the two fields WordPress does not have
 * (`read_time`, `view_count`) are either computed or honestly left empty.
 */

const wpPost = {
  id: 4821,
  slug: 'pink-salt-for-cooking',
  status: 'publish',
  date_gmt: '2026-08-01T09:30:00',
  modified_gmt: '2026-08-02T10:00:00',
  title: { rendered: 'Pink Salt &amp; Cooking&#8217;s Best Friend' },
  content: { rendered: '<p>Rock salt is mined, not manufactured.</p><p>Use it sparingly.</p>' },
  excerpt: { rendered: '<p>A short &nbsp;<em>introduction</em>.</p>' },
  author: 7,
  _embedded: {
    author: [{ id: 7, name: 'Salman Bashir', avatar_urls: { '96': 'https://example.test/a.png' } }],
    'wp:featuredmedia': [{ source_url: 'https://example.test/salt.jpg' }],
    'wp:term': [
      [
        { id: 3, name: 'Cooking', taxonomy: 'category' },
        { id: 9, name: 'Recipes', taxonomy: 'post_tag' },
        { id: 10, name: 'Salt', taxonomy: 'post_tag' },
      ],
    ],
  },
  yoast_head_json: { title: 'SEO title', description: 'SEO description' },
};

describe('blogPostFromWp', () => {
  it('preserves the editor byline instead of silently replacing it with the WP login', () => {
    expect(blogPostFromWp({ ...wpPost, meta: { hk_author_name: 'Himalayan Koh' } }).author?.full_name).toBe('Himalayan Koh');
    expect(blogPostFromWp({ ...wpPost, meta: { hk_author_name: '   ' } }).author?.full_name).toBe('Salman Bashir');
    expect(blogPostFromWp({ ...wpPost, _embedded: {}, meta: { hk_author_name: 'Himalayan Koh' } }).author?.full_name).toBe('Himalayan Koh');
  });

  it('maps the post into the shape the screens render', () => {
    const post = blogPostFromWp(wpPost);

    expect(post.id).toBe('4821');
    expect(post.slug).toBe('pink-salt-for-cooking');
    expect(post.title).toBe("Pink Salt & Cooking's Best Friend");
    expect(post.category).toBe('Cooking');
    expect(post.tags).toEqual(['Recipes', 'Salt']);
    expect(post.featured_image).toBe('https://example.test/salt.jpg');
    expect(post.author).toEqual({ id: '7', full_name: 'Salman Bashir', avatar_url: 'https://example.test/a.png' });
  });

  it('strips markup out of the excerpt and decodes its entities', () => {
    const post = blogPostFromWp(wpPost);

    expect(post.excerpt).toBe('A short introduction.');
    // The body keeps its markup: the article page renders it.
    expect(post.content).toContain('<p>');
  });

  it('treats UTC dates as UTC rather than local time', () => {
    const post = blogPostFromWp(wpPost);

    expect(post.published_at).toBe('2026-08-01T09:30:00Z');
    expect(post.updated_at).toBe('2026-08-02T10:00:00Z');
  });

  it('computes reading time from the words rather than storing it', () => {
    const post = blogPostFromWp(wpPost);

    // Eight words, so one minute — the floor, never zero.
    expect(post.read_time).toBe(1);
  });

  it('reports status as publication and invents no view count', () => {
    expect(blogPostFromWp(wpPost).is_published).toBe(true);
    expect(blogPostFromWp({ ...wpPost, status: 'draft' }).is_published).toBe(false);
    // WordPress has no native counter, and a made-up number is worse than zero.
    expect(blogPostFromWp(wpPost).view_count).toBe(0);
  });

  it('falls back to the post title and excerpt when Yoast is absent', () => {
    const { yoast_head_json, ...withoutYoast } = wpPost;
    void yoast_head_json;

    const post = blogPostFromWp(withoutYoast);

    expect(post.meta_title).toBeNull();
    expect(post.meta_description).toBeNull();
  });

  it('survives a post with no embedded media, author or terms', () => {
    const bare = { id: 1, slug: 'x', status: 'publish', title: { rendered: 'X' } };

    const post = blogPostFromWp(bare);

    expect(post.featured_image).toBeNull();
    expect(post.author).toBeNull();
    expect(post.category).toBeNull();
    expect(post.tags).toEqual([]);
    expect(post.excerpt).toBeNull();
  });
});
