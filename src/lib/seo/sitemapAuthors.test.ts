import { describe, it, expect } from 'vitest';
import { AUTHORS, getAllAuthors, getAuthorBySlug } from '@/data/authors';
import { RESOURCE_ARTICLES } from '@/data/resources';

describe('Sitemap & Author Branding Integrity', () => {
  it('contains zero personal names (Salman, Ayaz) in public author entities', () => {
    const authors = getAllAuthors();
    expect(authors.length).toBeGreaterThan(0);

    for (const author of authors) {
      const serialized = JSON.stringify(author).toLowerCase();
      expect(serialized).not.toContain('salman');
      expect(serialized).not.toContain('ayaz');
      expect(author.name.toLowerCase()).not.toContain('salman');
      expect(author.name.toLowerCase()).not.toContain('ayaz');
      expect(author.slug.toLowerCase()).not.toContain('salman');
      expect(author.slug.toLowerCase()).not.toContain('ayaz');
    }
  });

  it('all authors are Himalayan Koh organizational entities', () => {
    const authors = getAllAuthors();
    for (const author of authors) {
      expect(author.name).toMatch(/Himalayan Koh/i);
      expect(author.bio).not.toContain('Placeholder');
    }
  });

  it('every resource article references a valid author and reviewer', () => {
    for (const article of RESOURCE_ARTICLES) {
      const author = getAuthorBySlug(article.authorId) || AUTHORS[article.authorId];
      const reviewer = getAuthorBySlug(article.reviewerId) || AUTHORS[article.reviewerId];

      expect(author, `Article ${article.slug} has invalid author ${article.authorId}`).toBeDefined();
      expect(reviewer, `Article ${article.slug} has invalid reviewer ${article.reviewerId}`).toBeDefined();

      expect(author?.name.toLowerCase()).not.toContain('salman');
      expect(author?.name.toLowerCase()).not.toContain('ayaz');
      expect(reviewer?.name.toLowerCase()).not.toContain('salman');
      expect(reviewer?.name.toLowerCase()).not.toContain('ayaz');
    }
  });
});
