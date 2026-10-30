import { describe, expect, it } from 'vitest';
import { hasCatalogImageUrl, normalizeCatalogImageUrl } from './imageUrl';

describe('catalog image URL dedupe', () => {
  it('ignores fragments and a trailing slash when comparing the same URL', () => {
    expect(normalizeCatalogImageUrl(' https://example.test/image.jpg#view ')).toBe('https://example.test/image.jpg');
    expect(hasCatalogImageUrl(['https://example.test/image.jpg'], 'https://example.test/image.jpg#view')).toBe(true);
  });

  it('does not treat different image URLs as duplicates', () => {
    expect(hasCatalogImageUrl(['https://example.test/a.jpg'], 'https://example.test/b.jpg')).toBe(false);
  });
});
