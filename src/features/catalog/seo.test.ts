import { describe, expect, it } from 'vitest';
import { merchantOfferExtras, productPath, productUrl } from './seo';

describe('address-specific delivery estimates', () => {
  it.each([
    {},
    { deliveryMinDays: 2, deliveryMaxDays: 5 },
    { deliveryMinDays: 3, deliveryMaxDays: null },
  ])('never advertises a listing delivery window, including historical metadata: %j', (legacy) => {
    const extras = merchantOfferExtras({ ...legacy, freeShipping: false, shippingCost: 8.5 });
    expect(extras.shippingDetails).toEqual({
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
      shippingRate: { '@type': 'MonetaryAmount', value: '8.50', currency: 'USD' },
    });
    expect(extras.hasMerchantReturnPolicy).toBeDefined();
  });
});

describe('catalog product route', () => {
  it('uses /products for admin preview and storefront links', () => {
    const product = { id: '2497', slug: 'himalayan-rock-salt-45-lbs-2-3-large-chunks' };
    expect(productPath(product)).toBe('/products/himalayan-rock-salt-45-lbs-2-3-large-chunks');
    expect(productUrl(product)).toContain('/products/himalayan-rock-salt-45-lbs-2-3-large-chunks');
  });

  it('falls back to the product id when a slug is absent', () => {
    expect(productPath({ id: '2497' })).toBe('/products/2497');
  });
});
