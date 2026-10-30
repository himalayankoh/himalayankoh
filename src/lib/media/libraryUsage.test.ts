import { describe, expect, it } from 'vitest';
import { buildImageUsageIndex, imageFileKey, usageForImage } from './libraryUsage';

describe('imageFileKey', () => {
  it('strips the directory, extension and query string', () => {
    expect(imageFileKey('https://x.test/wp-content/uploads/2026/09/salt-lick-for-horse.jpg')).toBe(
      'salt-lick-for-horse'
    );
    expect(imageFileKey('/images/hero.png?v=2#top')).toBe('hero');
  });

  it('undoes a WordPress resize suffix so a resized copy matches the original', () => {
    expect(imageFileKey('https://x.test/u/2026/09/salt-lick-300x200.jpg')).toBe('salt-lick');
    expect(imageFileKey('https://x.test/u/2026/09/salt-lick.webp')).toBe('salt-lick');
  });

  it('decodes percent-escapes', () => {
    expect(imageFileKey('https://x.test/u/a%20salt%20photo.jpeg')).toBe('a salt photo');
  });

  it('returns null for nothing usable', () => {
    expect(imageFileKey('')).toBeNull();
    expect(imageFileKey('   ')).toBeNull();
  });

  it('survives a malformed percent-escape instead of throwing', () => {
    expect(imageFileKey('https://x.test/u/bad%2.jpg')).toBe('bad%2');
  });
});

describe('buildImageUsageIndex / usageForImage', () => {
  const products = [
    {
      id: '2728',
      name: 'Salt Rock for Cattle',
      images: [
        'https://x.test/u/2026/09/rock-cattle.jpg',
        'https://x.test/u/2026/09/rock-cattle-600x450.jpg',
        'https://x.test/u/2026/09/rock-cattle-detail.jpeg',
      ],
    },
    {
      id: '2653',
      name: 'Edible Pink Salt 16 oz',
      images: ['https://x.test/u/2026/09/edible-jar.png', 'https://x.test/u/2026/09/rock-cattle.jpg'],
    },
  ];

  it('reports the main image as primary and gallery images as not', () => {
    const index = buildImageUsageIndex(products);
    const usage = usageForImage('https://himalayankoh.com/staging/wp-content/uploads/2026/09/rock-cattle.jpg', index);
    expect(usage).toEqual([
      { id: '2728', name: 'Salt Rock for Cattle', isPrimary: true },
      { id: '2653', name: 'Edible Pink Salt 16 oz', isPrimary: false },
    ]);
  });

  it('counts a product once even when it renders its own resized copy', () => {
    const index = buildImageUsageIndex(products);
    const usage = usageForImage('https://x.test/u/2026/09/rock-cattle.jpg', index);
    expect(usage.filter((u) => u.id === '2728')).toHaveLength(1);
  });

  it('matches a library original to a product\'s resized URL and vice versa', () => {
    const index = buildImageUsageIndex(products);
    expect(usageForImage('https://x.test/u/2026/09/rock-cattle-300x200.jpg', index).length).toBe(2);
  });

  it('returns nothing for an image no product renders', () => {
    const index = buildImageUsageIndex(products);
    expect(usageForImage('https://x.test/u/2026/09/unused-photo.jpg', index)).toEqual([]);
    expect(usageForImage('', index)).toEqual([]);
  });

  it('is empty for an empty catalogue and tolerates a missing images array', () => {
    expect(buildImageUsageIndex([]).size).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const index = buildImageUsageIndex([{ id: '1', name: 'No images', images: undefined as any }]);
    expect(index.size).toBe(0);
  });
});
