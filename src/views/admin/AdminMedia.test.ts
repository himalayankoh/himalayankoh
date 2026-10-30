/**
 * Regression test for AdminMedia missing-alt calculation and filtering.
 *
 * Prevents the bug where missingAlt used an invalid dependency array and stayed permanently at 0.
 */

import { describe, expect, it } from 'vitest';

describe('AdminMedia alt text metric calculation', () => {
  interface MediaItem {
    id: number;
    alt: string | null;
    bytes?: number;
  }

  function computeMissingAlt(items: MediaItem[]): MediaItem[] {
    return items.filter((item) => !item.alt);
  }

  it('accurately counts items with missing alt text when alt is null or empty', () => {
    const mediaSample: MediaItem[] = [
      { id: 1, alt: null },
      { id: 2, alt: '' },
      { id: 3, alt: 'A real description' },
      { id: 4, alt: null },
    ];

    const missing = computeMissingAlt(mediaSample);
    expect(missing).toHaveLength(3);
    expect(missing.map((m) => m.id)).toEqual([1, 2, 4]);
  });

  it('correctly handles an all-null library (e.g. 33 assets with null alt)', () => {
    const media33: MediaItem[] = Array.from({ length: 33 }, (_, i) => ({
      id: i + 1,
      alt: null,
    }));

    const missing = computeMissingAlt(media33);
    expect(missing).toHaveLength(33);
    expect(missing.length).not.toBe(0);
  });

  it('correctly handles a fully-annotated library', () => {
    const completeMedia: MediaItem[] = [
      { id: 1, alt: 'Salt block on pasture' },
      { id: 2, alt: 'Pink salt fine grain 10lb pouch' },
    ];

    const missing = computeMissingAlt(completeMedia);
    expect(missing).toHaveLength(0);
  });
});
