import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlogPostWithAuthor } from '@/lib/blog/types';

const blog = vi.hoisted(() => ({
  getRelatedPosts: vi.fn(),
  getPostBySlug: vi.fn(),
}));

vi.mock('@/lib/blog/wordpressBlog', () => ({
  wordpressBlog: { getRelatedPosts: blog.getRelatedPosts, getPostBySlug: blog.getPostBySlug },
  getPostsForCategoryHub: vi.fn(),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

function post(over: Partial<BlogPostWithAuthor>): BlogPostWithAuthor {
  return {
    id: '1',
    title: 'How to Cook with Himalayan Pink Salt',
    slug: 'how-to-cook-with-himalayan-pink-salt',
    excerpt: null,
    content: null,
    featured_image: null,
    author_id: null,
    category: null,
    tags: [],
    is_published: true,
    published_at: '2026-10-10T10:00:00Z',
    meta_title: null,
    meta_description: null,
    read_time: 4,
    view_count: 0,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: '2026-10-10T10:00:00Z',
    author: null,
    ...over,
  };
}

async function related(limit = 3) {
  blog.getRelatedPosts.mockResolvedValue([
    post({ id: '2', title: 'Why do dairy cows need trace minerals?', slug: 'why-do-dairy-cows-need-trace-minerals' }),
    post({ id: '3', title: 'Himalayan Pink Vs. White Salt – Why Farmers Buy Pink', slug: 'himalayan-pink-vs-white-salt-farmers' }),
  ]);
  const response = await GET(new Request('https://himalayankoh.com/api/blog/articles?related=1&limit=' + limit));
  return (await response.json()) as { posts: BlogPostWithAuthor[] };
}

/**
 * The blog index and the sitemap read through `fetchSeoBlogPosts`, which applies the
 * niche gate in `lib/catalog/nicheBlog.ts`. The "keep reading" strip did not, so the
 * live article linked to the two livestock-era posts the storefront withholds
 * everywhere else — advertised them with internal links, and rendered their cards
 * with no image because those posts never had a featured one.
 */
describe('blog articles API — the related read', () => {
  it('withholds the livestock post but keeps the pink-salt guide beside it', async () => {
    // "farmers" is not the livestock word "farm" — that distinction is deliberate in
    // `nicheBlog.ts`, and the pink-vs-white guide is published, so it stays.
    const { posts } = await related();

    expect(posts.map((entry) => entry.slug)).toEqual(['himalayan-pink-vs-white-salt-farmers']);
    expect(blog.getRelatedPosts).toHaveBeenCalledWith('1', null, 3);
  });

  it('keeps a pink-salt post and drops only the off-niche ones beside it', async () => {
    blog.getRelatedPosts.mockResolvedValue([
      post({ id: '2', title: 'Why do dairy cows need trace minerals?', slug: 'why-do-dairy-cows-need-trace-minerals' }),
      post({ id: '4', title: 'Fine vs coarse Himalayan pink salt in the kitchen', slug: 'fine-vs-coarse-pink-salt' }),
    ]);

    const response = await GET(new Request('https://himalayankoh.com/api/blog/articles?related=1'));
    const { posts } = (await response.json()) as { posts: BlogPostWithAuthor[] };

    expect(posts.map((entry) => entry.slug)).toEqual(['fine-vs-coarse-pink-salt']);
  });

  it('still answers with the post itself for a slug read', async () => {
    const article = post({ id: '9', slug: 'how-to-cook-with-himalayan-pink-salt' });
    blog.getPostBySlug.mockResolvedValue(article);

    const response = await GET(new Request('https://himalayankoh.com/api/blog/articles?slug=how-to-cook-with-himalayan-pink-salt'));
    const { posts } = (await response.json()) as { posts: BlogPostWithAuthor[] };

    expect(posts).toEqual([article]);
    expect(blog.getRelatedPosts).not.toHaveBeenCalled();
  });
});
