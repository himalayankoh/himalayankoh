import { describe, expect, it, vi } from 'vitest';
import type { BlogPostWithAuthor } from '@/lib/blog/types';

const blog = vi.hoisted(() => ({ getPostBySlug: vi.fn() }));

vi.mock('@/lib/blog/wordpressBlog', () => ({
  wordpressBlog: { getPostBySlug: blog.getPostBySlug },
  getPostsForCategoryHub: vi.fn(),
}));

import { lookupSeoBlogPostFull } from './server';

const post: BlogPostWithAuthor = {
  id: '2475',
  title: 'How to Cook with Himalayan Pink Salt',
  slug: 'how-to-cook-with-himalayan-pink-salt',
  excerpt: null,
  content: '<p>…</p>',
  featured_image: null,
  author_id: null,
  category: null,
  tags: [],
  is_published: true,
  published_at: '2026-10-10T10:00:00Z',
  meta_title: null,
  meta_description: null,
  read_time: 5,
  view_count: 0,
  created_at: '2026-10-10T10:00:00Z',
  updated_at: '2026-10-10T10:00:00Z',
  author: null,
};

/**
 * The article route answers 404 only for a slug the store says does not exist.
 * The two outcomes used to be one nullable value, so an unreachable store looked
 * exactly like a missing article: the route served a blank 200 for both, and a
 * 404 for a real article was one careless change away.
 */
describe('blog article lookup', () => {
  it('reports a published post as found', async () => {
    blog.getPostBySlug.mockResolvedValue(post);

    const lookup = await lookupSeoBlogPostFull('how-to-cook-with-himalayan-pink-salt');

    expect(lookup).toEqual({ state: 'found', post });
  });

  it('reports an empty answer from the store as missing, which is what 404 is for', async () => {
    blog.getPostBySlug.mockResolvedValue(null);

    expect(await lookupSeoBlogPostFull('no-such-guide')).toEqual({ state: 'missing' });
  });

  it('never reports a failed read as missing', async () => {
    // A timeout, an HTTP error or a WordPress fatal all arrive here as a throw.
    blog.getPostBySlug.mockRejectedValue(new Error('The store did not respond in time.'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await lookupSeoBlogPostFull('how-to-cook-with-himalayan-pink-salt')).toEqual({
      state: 'unavailable',
    });
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it('treats an empty slug as missing rather than reading the store', async () => {
    blog.getPostBySlug.mockReset();

    expect(await lookupSeoBlogPostFull('   ')).toEqual({ state: 'missing' });
    expect(blog.getPostBySlug).not.toHaveBeenCalled();
  });
});
