import { describe, expect, it } from 'vitest';

import {
  CARD_IMAGE_SIZES,
  GALLERY_IMAGE_SIZES,
  MAX_CANDIDATE_RATIO,
  dropResponsiveCandidates,
  parseStoreSrcset,
  responsiveImageProps,
  type ResponsiveImageSources,
} from './responsiveImage';

const UPLOADS = 'https://himalayankoh.com/staging/wp-content/uploads/2026/09';

/**
 * The PNG staging actually publishes for product 2683, measured 2026-09-30.
 *
 * It is the storefront's worst asset: 573×573 at 482 kB, drawn into a ~300 px
 * card. WordPress republishes it at every size below, and WordPress also
 * republishes 500 px (399 kB), 370 px (236 kB) and 360 px (224 kB). Those are the
 * sizes that must not be offered: on the already-optimized WebP images in the same
 * gallery they are *bigger* than the original they came from.
 */
const PNG_SRC =
  `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1.png`;

describe('parseStoreSrcset', () => {
  it('keeps only the WordPress sizes that are a real saving', () => {
    const srcset = [
      `${PNG_SRC} 573w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-300x300.png 300w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-150x150.png 150w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-500x500.png 500w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-370x370.png 370w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-180x180.png 180w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-360x360.png 360w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-100x100.png 100w`,
    ].join(', ');

    const source = parseStoreSrcset(srcset, PNG_SRC);

    expect(source).not.toBeNull();
    // The width is the store's own number for the original, not a guess.
    expect(source?.width).toBe(573);
    // 500, 370 and 360 sit above the ratio. On the WebP images in the same
    // gallery, 370 and 360 are larger files than the original, so offering them
    // would let the browser pick a bigger download than it uses today.
    expect(source?.tokens).toEqual(['100x100', '150x150', '180x180', '300x300']);
  });

  it('refuses a srcset that does not name the original, because the width would be a guess', () => {
    const srcset = `${UPLOADS}/something-else-300x300.png 300w`;

    expect(parseStoreSrcset(srcset, PNG_SRC)).toBeNull();
  });

  it('returns null when every candidate is above the ratio', () => {
    const srcset = [
      `${PNG_SRC} 573w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-500x500.png 500w`,
    ].join(', ');

    expect(parseStoreSrcset(srcset, PNG_SRC)).toBeNull();
  });

  it('drops a candidate that is not the original plus a plain size suffix', () => {
    const srcset = [
      `${PNG_SRC} 573w`,
      // A WordPress editor crop: real, but not a token this module can rebuild.
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-e1727000000-300x300.png 300w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-180x180.png 180w`,
    ].join(', ');

    expect(parseStoreSrcset(srcset, PNG_SRC)?.tokens).toEqual(['180x180']);
  });

  it('does not build sizes from an image that is already a WordPress intermediate', () => {
    const alreadySized = `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-300x300.png`;
    const srcset = [
      `${alreadySized} 300w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-300x300-150x150.png 150w`,
    ].join(', ');

    expect(parseStoreSrcset(srcset, alreadySized)).toBeNull();
  });

  it('ignores a srcset that is missing or empty', () => {
    expect(parseStoreSrcset(undefined, PNG_SRC)).toBeNull();
    expect(parseStoreSrcset('', PNG_SRC)).toBeNull();
    expect(parseStoreSrcset(`${PNG_SRC} 573w`, '')).toBeNull();
  });

  it('keeps the ratio boundary inclusive', () => {
    const boundary = Math.floor(573 * MAX_CANDIDATE_RATIO); // 315
    const srcset = [
      `${PNG_SRC} 573w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-${boundary}x${boundary}.png ${boundary}w`,
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-${boundary + 1}x${boundary + 1}.png ${boundary + 1}w`,
    ].join(', ');

    expect(parseStoreSrcset(srcset, PNG_SRC)?.tokens).toEqual([`${boundary}x${boundary}`]);
  });
});

describe('responsiveImageProps', () => {
  const sources: ResponsiveImageSources = {
    [PNG_SRC]: { width: 573, tokens: ['100x100', '300x300'] },
  };

  it('rebuilds the candidate URLs and keeps the original as the largest candidate', () => {
    const props = responsiveImageProps(PNG_SRC, sources, CARD_IMAGE_SIZES);

    expect(props.src).toBe(PNG_SRC);
    expect(props.sizes).toBe(CARD_IMAGE_SIZES);
    // The original must be present: without it the browser would upscale the
    // 300 px candidate into a slot wider than 300 px.
    expect(props.srcSet).toBe(
      `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-100x100.png 100w, ` +
        `${UPLOADS}/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1-300x300.png 300w, ` +
        `${PNG_SRC} 573w`
    );
  });

  it('renders a plain src for an image the store published nothing for', () => {
    const props = responsiveImageProps('/images/legacy/bowl-of-salt.jpg', sources, CARD_IMAGE_SIZES);

    expect(props).toEqual({ src: '/images/legacy/bowl-of-salt.jpg' });
  });

  it('renders a plain src when there is no map at all', () => {
    expect(responsiveImageProps(PNG_SRC, undefined, GALLERY_IMAGE_SIZES)).toEqual({ src: PNG_SRC });
  });

  it('renders a plain src when the recorded url cannot be extended', () => {
    const sized = `${UPLOADS}/already-300x300.png`;
    const props = responsiveImageProps(sized, { [sized]: { width: 300, tokens: ['150x150'] } }, CARD_IMAGE_SIZES);

    expect(props).toEqual({ src: sized });
  });
});

describe('dropResponsiveCandidates', () => {
  const fakeImage = (srcset: string | null) => {
    const attributes: Record<string, string> = {};
    if (srcset !== null) attributes.srcset = srcset;
    return {
      get srcset() {
        return attributes.srcset ?? '';
      },
      removeAttribute(name: string) {
        delete attributes[name];
      },
      read(name: string) {
        return attributes[name];
      },
    };
  };

  it('removes the candidate list so the browser can fall back to the original', () => {
    const image = fakeImage('https://example.test/a-300x300.png 300w, https://example.test/a.png 573w');

    expect(dropResponsiveCandidates(image as unknown as HTMLImageElement)).toBe(true);
    expect(image.srcset).toBe('');
    expect(image.read('sizes')).toBeUndefined();
  });

  it('reports false when there was nothing added, so the caller uses the placeholder', () => {
    expect(dropResponsiveCandidates(fakeImage(null) as unknown as HTMLImageElement)).toBe(false);
  });
});
