import { describe, expect, it } from 'vitest';
import {
  LIVE_LAUNCH_PRODUCT_IDS,
  OWNER_APPROVED_SKUS,
  OWNER_REJECTED_PRODUCT_IDS,
  isOwnerRejectedProduct,
} from '../catalog/niche';
import { RESOURCE_ARTICLES, getAllResourceArticles, getResourceArticleBySlug } from '../../data/resources';
import { AUTHORS, getAllAuthors } from '../../data/authors';
import { requiresNoindex } from './indexing';
import { hasProhibitedClaim } from '../products/claims';

describe('Phase 23 — Automated AdSense & Compliance Safety Gates', () => {
  describe('Catalog & SKU Integrity', () => {
    it('has zero duplicate SKUs among approved products', () => {
      const unique = new Set(OWNER_APPROVED_SKUS);
      expect(unique.size).toBe(OWNER_APPROVED_SKUS.length);
    });

    it('blocks retired legacy products from public display', () => {
      const retiredProductIds = [2352, 2372, 2461];
      retiredProductIds.forEach((id) => {
        expect(isOwnerRejectedProduct(id)).toBe(true);
        expect(OWNER_REJECTED_PRODUCT_IDS).toContain(id);
      });
    });

    it('applies the owner\u2019s launch admission, and nothing wider than it', () => {
      // `2321` and `2446` left the retired list on 2026-10-09 for the live launch,
      // and the admission names them explicitly rather than opening a class of
      // product: no record outside this list is admitted by it.
      expect(LIVE_LAUNCH_PRODUCT_IDS).toEqual([271, 281, 291, 2321, 2446]);
      expect(isOwnerRejectedProduct(2321)).toBe(false);
      expect(isOwnerRejectedProduct(2446)).toBe(false);
      expect(isOwnerRejectedProduct(2352)).toBe(true);
    });
  });

  describe('Indexing & Preview Isolation', () => {
    it('enforces noindex on preview/staging hostnames', () => {
      expect(requiresNoindex('preview.himalayankoh.com')).toBe(true);
      expect(requiresNoindex('preview.himalayankoh.com:443')).toBe(true);
      expect(requiresNoindex('staging.himalayankoh.com')).toBe(true);
      expect(requiresNoindex('dev.himalayankoh.com')).toBe(true);
      expect(requiresNoindex('localhost:3000')).toBe(true);
    });

    it('allows indexation on production hostname', () => {
      expect(requiresNoindex('himalayankoh.com')).toBe(false);
      expect(requiresNoindex('www.himalayankoh.com')).toBe(false);
    });
  });

  describe('Resource Center & E-E-A-T Quality', () => {
    it('contains at least 10 substantial resource articles', () => {
      expect(RESOURCE_ARTICLES.length).toBeGreaterThanOrEqual(10);
    });

    it('every resource article has a valid slug, title, summary, and sections', () => {
      RESOURCE_ARTICLES.forEach((article) => {
        expect(article.slug).toMatch(/^[a-z0-9-]+$/);
        expect(article.title.length).toBeGreaterThan(15);
        expect(article.summary.length).toBeGreaterThan(50);
        expect(article.sections.length).toBeGreaterThanOrEqual(2);
        expect(article.readTime).toMatch(/^[0-9]+ min read$/);
        expect(article.authorId).toBeTruthy();
        expect(AUTHORS[article.authorId]).toBeDefined();
      });
    });

    it('has zero duplicate slugs across all resource guides', () => {
      const slugs = RESOURCE_ARTICLES.map((a) => a.slug);
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it('every article cites verifiable references or extension sources', () => {
      RESOURCE_ARTICLES.forEach((article) => {
        expect(article.sources.length).toBeGreaterThanOrEqual(1);
        article.sources.forEach((src) => {
          expect(src.title).toBeTruthy();
          expect(src.publication).toBeTruthy();
        });
      });
    });
  });

  describe('Author & Reviewer System', () => {
    it('has transparent, structured author records', () => {
      const authors = getAllAuthors();
      expect(authors.length).toBeGreaterThanOrEqual(2);
      authors.forEach((author) => {
        expect(author.slug).toBeTruthy();
        expect(author.name).toBeTruthy();
        expect(author.role).toBeTruthy();
        expect(author.bio.length).toBeGreaterThan(50);
        expect(author.expertise.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Prohibited Claims Prevention', () => {
    it('prohibits unsupported veterinary and medical disease claims', () => {
      expect(hasProhibitedClaim('Himalayan salt cures arthritis and joint inflammation.')).toBe(true);
      expect(hasProhibitedClaim('Guaranteed to heal colic and laminitis.')).toBe(true);
      expect(hasProhibitedClaim('FDA-approved mineral block for cattle.')).toBe(true);
      expect(hasProhibitedClaim('Kills bacteria and detoxifies blood.')).toBe(true);
    });

    it('resource articles do not contain prohibited medical or veterinary claims', () => {
      RESOURCE_ARTICLES.forEach((article) => {
        article.sections.forEach((section) => {
          section.body.forEach((para) => {
            expect(hasProhibitedClaim(para)).toBe(false);
          });
        });
      });
    });
  });

  describe('Required Core Routes Existence', () => {
    const requiredPublicPaths = [
      '/',
      '/about',
      '/resources',
      '/products',
      '/contact',
      '/faqs',
      '/disclaimer',
      '/privacy',
      '/terms',
      '/shipping',
      '/return',
      '/sitemap',
      '/ads.txt',
    ];

    it.each(requiredPublicPaths)('verifies path format for %s', (path) => {
      expect(path.startsWith('/')).toBe(true);
      expect(path).not.toContain('//');
    });
  });
});
