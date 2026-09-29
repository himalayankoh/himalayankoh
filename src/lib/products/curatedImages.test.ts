import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CURATED_PRODUCT_IMAGES, curatedProductImages, resolveCuratedProductImages } from './curatedImages';

describe('Curated product images for salt blocks and licks', () => {
  it('defines 4 high quality images for himalayan-salt-block-30-lbs and himalayan-salt-lick-30-lbs', () => {
    const blockImages = CURATED_PRODUCT_IMAGES['himalayan-salt-block-30-lbs'];
    expect(blockImages).toHaveLength(4);
    expect(blockImages[0]).toBe('/images/products/himalayan-salt-block-30lbs-hero.webp');
    expect(blockImages[1]).toBe('/images/products/himalayan-salt-block-30lbs-horse.webp');
    expect(blockImages[2]).toBe('/images/products/himalayan-salt-block-30lbs-cow.webp');
    expect(blockImages[3]).toBe('/images/products/himalayan-salt-block-30lbs-livestock.webp');

    const lickImages = CURATED_PRODUCT_IMAGES['himalayan-salt-lick-30-lbs'];
    expect(lickImages).toHaveLength(4);
    expect(lickImages).toEqual(blockImages);
  });

  it('defines 5 curated images for 3 lbs and 6 lbs rope salt licks', () => {
    const lick3lbs = CURATED_PRODUCT_IMAGES['himalayan-salt-lick-3-to-4-lbs'];
    expect(lick3lbs).toHaveLength(5);
    expect(lick3lbs[0]).toBe('/images/products/himalayan-salt-lick-rope-hero.webp');
    expect(lick3lbs[1]).toBe('/images/products/himalayan-salt-lick-rope-front.webp');
    expect(lick3lbs[2]).toBe('/images/products/himalayan-salt-lick-rope-horse.webp');
    expect(lick3lbs[3]).toBe('/images/products/himalayan-salt-lick-rope-angle.webp');
    expect(lick3lbs[4]).toBe('/images/products/himalayan-salt-lick-rope-label.webp');

    const lick6lbs = CURATED_PRODUCT_IMAGES['himalayan-salt-lick-5-to-6-lbs'];
    expect(lick6lbs).toHaveLength(5);
    expect(lick6lbs).toEqual(lick3lbs);
  });

  it('matches by SKU case-insensitively', () => {
    const resolved30 = resolveCuratedProductImages('other-slug', 'HK-LB-30LBS', []);
    expect(resolved30).toHaveLength(4);
    expect(resolved30[0]).toBe('/images/products/himalayan-salt-block-30lbs-hero.webp');

    const resolved6 = resolveCuratedProductImages('other-slug', 'HK-LFH-6lbs', []);
    expect(resolved6).toHaveLength(5);
    expect(resolved6[0]).toBe('/images/products/himalayan-salt-lick-rope-hero.webp');
  });

  it('matches by slug case-insensitively', () => {
    const resolved = resolveCuratedProductImages('HIMALAYAN-SALT-BLOCK-30-LBS', null, []);
    expect(resolved).toHaveLength(4);
    expect(resolved[0]).toBe('/images/products/himalayan-salt-block-30lbs-hero.webp');
  });

  it('prepends curated images before existing images while avoiding duplicates', () => {
    const existing = ['https://example.com/legacy-lick.jpg'];
    const resolved = resolveCuratedProductImages('himalayan-salt-lick-30-lbs', 'HK-LFH-30lbs', existing);
    expect(resolved).toHaveLength(5);
    expect(resolved[0]).toBe('/images/products/himalayan-salt-block-30lbs-hero.webp');
    expect(resolved[4]).toBe('https://example.com/legacy-lick.jpg');
  });

  it('returns existing images untouched when no curated images are mapped', () => {
    const existing = ['/images/products/pouch.webp'];
    const resolved = resolveCuratedProductImages('unrelated-product', 'HK-OTHER', existing);
    expect(resolved).toEqual(existing);
  });
});

// The defaults on their own, which is the half the admin editor needs: the
// storefront shows them, WooCommerce has never heard of them, and the editor
// has to be able to say so.
describe('curatedProductImages', () => {
  it('reports the app-shipped defaults for a slug or SKU, case-insensitively', () => {
    expect(curatedProductImages('himalayan-salt-block-30-lbs')).toHaveLength(4);
    expect(curatedProductImages('an-unknown-slug', 'hk-lb-30lbs')).toHaveLength(4);
    expect(curatedProductImages('an-unknown-slug', 'HK-LFh-6LBS')[0]).toBe(
      '/images/products/himalayan-salt-lick-rope-hero.webp'
    );
  });

  it('is empty rather than throwing for a product the map does not cover', () => {
    expect(curatedProductImages('unrelated-product', 'HK-OTHER')).toEqual([]);
    expect(curatedProductImages('', null)).toEqual([]);
    expect(curatedProductImages('himalayan-salt-block-30-lbs', undefined)).toHaveLength(4);
  });

  it('is exactly the set resolveCuratedProductImages overlays ahead of the gallery', () => {
    const defaults = curatedProductImages('himalayan-salt-lick-30-lbs', 'HK-LFH-30lbs');
    const resolved = resolveCuratedProductImages('himalayan-salt-lick-30-lbs', 'HK-LFH-30lbs', [
      'https://example.com/lick-4.jpg',
    ]);
    expect(resolved).toEqual([...defaults, 'https://example.com/lick-4.jpg']);
  });

  it('serves only image files that exist in this repository', () => {
    // A default that 404s would be a broken product page, and the failure mode
    // is invisible: the storefront would render an empty gallery frame.
    for (const [key, images] of Object.entries(CURATED_PRODUCT_IMAGES)) {
      for (const url of images) {
        expect(url.startsWith('/images/products/'), `${key} → ${url}`).toBe(true);
        expect(existsSync(join(process.cwd(), 'public', url)), `missing file for ${key} → ${url}`).toBe(true);
      }
    }
  });
});
