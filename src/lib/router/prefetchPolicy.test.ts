import { describe, expect, it } from 'vitest';

import { shouldPrefetchOnViewport } from './prefetchPolicy';

describe('shouldPrefetchOnViewport', () => {
  it('refuses a product page, which is its own server render', () => {
    expect(shouldPrefetchOnViewport('/products/himalayan-salt-block-30lbs-hero')).toBe(false);
    expect(shouldPrefetchOnViewport('/products/himalayan-salt-block-30lbs-hero?variant=2')).toBe(false);
  });

  it('refuses a filtered shelf, which is a distinct uncached render', () => {
    expect(shouldPrefetchOnViewport('/products?category=live-stock')).toBe(false);
    expect(shouldPrefetchOnViewport('/products?category=licks-blocks')).toBe(false);
    expect(shouldPrefetchOnViewport('/products?search=salt')).toBe(false);
    expect(shouldPrefetchOnViewport('/products?sort=price')).toBe(false);
    expect(shouldPrefetchOnViewport('/products?page=2')).toBe(false);
    expect(shouldPrefetchOnViewport('/products?featured=true')).toBe(false);
  });

  it('allows the plain catalogue listing, the one shared edge-cached page', () => {
    expect(shouldPrefetchOnViewport('/products')).toBe(true);
  });

  it('allows a tracker that merely starts with the catalogue word', () => {
    expect(shouldPrefetchOnViewport('/products-and-services')).toBe(true);
  });

  it('refuses the private surfaces whose answers are never shared', () => {
    for (const path of ['/cart', '/checkout', '/account', '/admin', '/login', '/order-confirmation', '/cart/anything']) {
      expect(shouldPrefetchOnViewport(path)).toBe(false);
    }
  });

  it('allows static marketing pages, so a footer click still feels instant', () => {
    for (const path of ['/', '/about', '/faqs', '/privacy', '/quality', '/shipping', '/blog']) {
      expect(shouldPrefetchOnViewport(path)).toBe(true);
    }
  });

  it('refuses destinations that are not routes on this site', () => {
    expect(shouldPrefetchOnViewport('https://example.com/products')).toBe(false);
    expect(shouldPrefetchOnViewport('mailto:hello@himalayankoh.com')).toBe(false);
    expect(shouldPrefetchOnViewport('tel:+1234567890')).toBe(false);
    expect(shouldPrefetchOnViewport('#top')).toBe(false);
    expect(shouldPrefetchOnViewport('')).toBe(false);
  });

  it('refuses a query-only destination, which the router writes in place', () => {
    expect(shouldPrefetchOnViewport('?category=edible-pink-salt')).toBe(false);
  });
});
