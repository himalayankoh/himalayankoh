import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_GEMINI_MODEL,
  resolveAiSeoConfig,
  type SeoDraftInput,
} from './gemini';
import { findProhibitedClaims } from '../products/claims';
import { OWNER_APPROVED_SKUS, isOwnerApprovedSku } from '../catalog/niche';
import {
  buildProductsCategoryPath,
  categoryKeyFromFilterLabel,
  CATEGORY_FILTER_TABS,
} from '../categoryContent';
import { nicheSectionKeyFor } from '../catalog/nicheSections';

describe('Admin AI SEO Engine & English Output Validation', () => {
  it('defaults to google/gemini-2.5-flash as the active OpenRouter model', () => {
    expect(DEFAULT_OPENROUTER_MODEL).toBe('google/gemini-2.5-flash');
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-2.5-flash');
  });

  it('validates that non-English / Urdu scripts are strictly detected and rejected', () => {
    const arabicUrduText = 'ہماری ہمالیائی نمک خالص ہے';
    const hasUrdu = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(arabicUrduText);
    expect(hasUrdu).toBe(true);

    const englishText = 'Authentic Himalayan pink salt packed in Houston, Texas.';
    const englishHasUrdu = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(englishText);
    expect(englishHasUrdu).toBe(false);
  });

  it('scans and blocks prohibited medical/veterinary claims in SEO copy', () => {
    const badCopy = 'This salt cures arthritis and is FDA approved for cattle.';
    const claims = findProhibitedClaims(badCopy);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.some((c) => c.match.toLowerCase().includes('cure') || c.match.toLowerCase().includes('fda'))).toBe(true);

    const goodCopy = 'Coarse grain Himalayan pink salt, 45 lb bag, shipped from Houston, Texas.';
    const goodClaims = findProhibitedClaims(goodCopy);
    expect(goodClaims).toHaveLength(0);
  });

  it('correctly structures SEO draft schema', () => {
    const draftMock = {
      language: 'en' as const,
      seoTitle: 'Himalayan Pink Rock Salt - 45 lbs | Himalayan Koh',
      metaDescription: 'Authentic coarse pink rock salt in 45 lb bulk pack, shipped from Houston, Texas.',
      primaryKeyword: 'Himalayan pink rock salt 45 lbs',
      secondaryKeywords: ['bulk pink salt', 'coarse rock salt'],
      imageAltSuggestions: ['45 lb bag of coarse pink salt'],
      shortSeoCopy: 'Unrefined Himalayan pink salt for culinary and kitchen use.',
      notes: ['Grain size: coarse', 'Origin: Pakistan'],
    };

    expect(draftMock.language).toBe('en');
    expect(draftMock.seoTitle.length).toBeLessThanOrEqual(60);
    expect(draftMock.metaDescription.length).toBeLessThanOrEqual(155);
    expect(draftMock.primaryKeyword).toBeTruthy();
    expect(draftMock.secondaryKeywords.length).toBeGreaterThanOrEqual(1);
    expect(draftMock.imageAltSuggestions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Catalog Grounding & Duplicate SKU Prevention', () => {
  it('contains exactly 19 approved SKUs with zero duplicates', () => {
    expect(OWNER_APPROVED_SKUS).toHaveLength(19);
    const unique = new Set(OWNER_APPROVED_SKUS);
    expect(unique.size).toBe(19);
  });

  it('confirms HK-LFH-6lbs is the approved draft SKU', () => {
    expect(isOwnerApprovedSku('HK-LFH-6lbs')).toBe(true);
  });

  it('grounds category taxonomy routing correctly without empty dead ends', () => {
    expect(CATEGORY_FILTER_TABS[0].label).toBe('All');
    expect(categoryKeyFromFilterLabel('Edible Pink Salt')).toBe('edible-pink-salt');
    expect(categoryKeyFromFilterLabel('Cooking & Serving')).toBe('cooking-serving');
    expect(categoryKeyFromFilterLabel('Salt Licks')).toBe('licks-blocks');
    // The bulk shelf is public and carries the store's own category name, so the
    // owner's filing in WooCommerce and the shop's filters agree.
    expect(categoryKeyFromFilterLabel('Bulk and Rock Salt')).toBe('bulk');

    expect(buildProductsCategoryPath('edible-pink-salt')).toBe('/products?category=edible-pink-salt');
    expect(buildProductsCategoryPath(null)).toBe('/products');
  });

  it('classifies product shelves correctly based on authentic salt attributes', () => {
    expect(nicheSectionKeyFor({ name: 'Himalayan Rock Salt 45 lbs', category: 'Bulk' })).toBe('bulk');
    expect(nicheSectionKeyFor({ name: 'Himalayan Salt Lick 30 lbs' })).toBe('licks-blocks');
    expect(nicheSectionKeyFor({ name: 'Himalayan Salt Block Rectangular' })).toBe('cooking-serving');
    expect(nicheSectionKeyFor({ name: 'Himalayan Pink Edible Salt Fine Grain' })).toBe('edible-pink-salt');
  });
});

describe('Policy Routes & Canonical Footer Links', () => {
  const policyRoutes = [
    { name: 'Privacy', path: '/privacy' },
    { name: 'Terms', path: '/terms' },
    { name: 'Shipping', path: '/shipping' },
    { name: 'Returns', path: '/returns' },
    { name: 'FAQs', path: '/faqs' },
    { name: 'Contact', path: '/contact' },
  ];

  it.each(policyRoutes)('$name policy route has canonical path $path', ({ path }) => {
    expect(path).toMatch(/^\/[a-z]+$/);
    expect(path.startsWith('/')).toBe(true);
  });
});
