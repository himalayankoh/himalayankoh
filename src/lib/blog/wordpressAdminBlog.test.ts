import { describe, expect, it } from 'vitest';
import { rowFromWpPost } from './wordpressAdminBlog';

const post = { id: 12, slug: 'cooking', status: 'publish', author: 7,
  title: { raw: 'Cooking & salt', rendered: 'Cooking &amp; salt' },
  _embedded: { author: [{ id: 7, name: 'WordPress account' }] } };

describe('WordPress blog editor mapping', () => {
  it('keeps the editorial byline while retaining the real WordPress author ID', () => {
    const row = rowFromWpPost({ ...post, meta: { hk_author_name: '  Himalayan Koh  ' } });
    expect(row.author_name).toBe('Himalayan Koh');
    expect(row.author_id).toBe('7');
    expect(row.title).toBe('Cooking & salt');
  });

  it('falls back only when the editorial byline is absent, blank, or invalid', () => {
    for (const name of [undefined, '', '  ', 123]) {
      expect(rowFromWpPost({ ...post, meta: { hk_author_name: name } }).author_name).toBe('WordPress account');
    }
    expect(rowFromWpPost({ ...post, _embedded: {}, meta: { hk_author_name: 'Editorial team' } }).author_name).toBe('Editorial team');
    expect(rowFromWpPost({ ...post, _embedded: {} }).author_name).toBeNull();
  });
});
