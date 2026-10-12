import { describe, expect, it } from 'vitest';
import { RESOURCE_ARTICLES } from '@/data/resources';
import { resolveRelatedProducts } from './relatedProducts';

/**
 * The catalogue fixture mirrors the live WooCommerce catalogue (verified
 * 2026-10-12: exactly these five active products). Refresh it from
 * `/api/catalog` when the catalogue changes; the data test below then
 * re-pins every guide link.
 */
const ACTIVE_CATALOG = [
  { slug: 'himalayan-salt-rock-for-cattle-30-lbs-bag-himalayan-koh', name: 'Himalayan Koh 30 lb Red Rock Salt Lick for Cattle' },
  { slug: 'himalayan-pink-salt-licks-for-horses-2-lbs-himalayan-koh', name: 'Himalayan Pink Salt Licks for Horses 2 lb' },
  { slug: 'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh', name: 'Himalayan Rock Salt for Livestock (45 lb)' },
  { slug: 'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh', name: 'Himalayan Pink Salt for Livestock - 6 lb Fine or Coarse Grain Pouches' },
  { slug: 'himalayan-edible-pink-salt-16-oz-jar-fine-grain', name: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain', category: 'Edible Pink Salt' },
];

/** Every slug that has ever been observed answering 404. Must never return. */
const KNOWN_DEAD_SLUGS = [
  'animal-salt-lick-3-4-kg',
  'salt-lick-5-6-kg',
  'compressed-salt-block-20kg',
  'himalayan-rock-salt-45-lbs-large-chunks',
  'himalayan-salt-block-30-lbs',
  'himalayan-salt-fine-grain-3-lbs',
  'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs',
  'cooking-salt-plate',
  'himalayan-salt-chunks',
  'himalayan-pink-edible-salt-16-oz-jar',
];

describe('resolveRelatedProducts', () => {
  it('keeps catalogue slugs in order with catalogue names', () => {
    const resolved = resolveRelatedProducts(
      [
        'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
        'himalayan-edible-pink-salt-16-oz-jar-fine-grain',
      ],
      ACTIVE_CATALOG
    );
    expect(resolved).toEqual([
      {
        slug: 'bag-of-himalayan-pink-salt-for-livestock-45-lbs-himalayan-koh',
        name: 'Himalayan Rock Salt for Livestock (45 lb)',
      },
      {
        slug: 'himalayan-edible-pink-salt-16-oz-jar-fine-grain',
        name: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain',
      },
    ]);
  });

  it('drops unknown, retired and blank slugs instead of serving 404 cards', () => {
    expect(
      resolveRelatedProducts(
        ['animal-salt-lick-3-4-kg', '', '  ', 'cooking-salt-plate', 'himalayan-salt-chunks'],
        ACTIVE_CATALOG
      )
    ).toEqual([]);
  });

  it('dedupes repeated slugs, keeping the first position', () => {
    const slug = 'himalayan-edible-pink-salt-16-oz-jar-fine-grain';
    expect(resolveRelatedProducts([slug, slug], ACTIVE_CATALOG)).toEqual([
      { slug, name: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain' },
    ]);
  });

  it('returns nothing when the catalogue read failed', () => {
    expect(
      resolveRelatedProducts(['himalayan-edible-pink-salt-16-oz-jar-fine-grain'], [])
    ).toEqual([]);
  });
});

describe('resource guide product links', () => {
  it('every static slug resolves against the active catalogue', () => {
    for (const article of RESOURCE_ARTICLES) {
      const resolved = resolveRelatedProducts(article.relatedProductSlugs, ACTIVE_CATALOG, article.productUse);
      expect(
        resolved.map((ref) => ref.slug),
        `Guide ${article.slug} references a slug outside the active catalogue`
      ).toEqual(article.relatedProductSlugs);
    }
  });

  it('no guide references a known-dead slug or the inactive 3 lb SKU', () => {
    for (const article of RESOURCE_ARTICLES) {
      for (const dead of KNOWN_DEAD_SLUGS) {
        expect(
          article.relatedProductSlugs,
          `Guide ${article.slug} references retired slug ${dead}`
        ).not.toContain(dead);
      }
    }
  });
});

describe('food-guide recommendations', () => {
  it('rejects animal copy even if an owner accidentally files it as edible', () => {
    const catalog = [
      { slug: 'feed', name: 'Pink Salt', category: 'Edible Pink Salt', description: 'Loose salt for livestock' },
      { slug: 'unknown', name: 'Pink Salt', category: 'Uncategorized' },
      { slug: 'missing-category', name: 'Edible Pink Salt' },
      ACTIVE_CATALOG[4],
    ];
    expect(resolveRelatedProducts(catalog.map(p => p.slug), catalog, 'food'))
      .toEqual([{ slug: ACTIVE_CATALOG[4].slug, name: ACTIVE_CATALOG[4].name }]);
  });

  it('all human-food guides require the food guard and recommend the actual edible SKU', () => {
    for (const slug of ['fine-vs-medium-vs-coarse-grain-salt', 'what-trace-minerals-in-himalayan-salt-actually-mean', 'himalayan-pink-salt-vs-regular-salt-practical-differences']) {
      const article = RESOURCE_ARTICLES.find(a => a.slug === slug)!;
      expect(article.productUse).toBe('food');
      expect(article.relatedProductSlugs).toEqual([ACTIVE_CATALOG[4].slug]);
    }
  });
});
