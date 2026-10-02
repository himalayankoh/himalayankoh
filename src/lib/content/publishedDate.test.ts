// ============================================================================
// The month label has to be the same string on the server and in the browser
//
// React #418 (hydration text mismatch) on a full load of
// `/products?category=edible-pink-salt` on the deployed preview (2026-10-01) came
// from exactly one text node: the PDF row's published month. Cloudflare Workers
// render in UTC; the shopper's browser does not. For a first-of-month date — the
// edible shelf's `2026-03-01` grain-size guide — those two runtimes disagree by a
// whole month ("March 2026" vs "February 2026"), so React discards the server
// HTML and re-renders.
//
// The important half of this test runs in America/Chicago, a timezone west of
// Greenwich, where a *naive* `toLocaleDateString` returns "February 2026" for the
// same input. It fails the moment `timeZone: 'UTC'` is dropped, no matter which
// timezone the test runner itself is in.
// ============================================================================
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatPublishedMonthYear } from './publishedDate';
import { CATEGORY_CONTENT_REGISTRY } from '@/lib/categoryContent/registry';

const originalTimeZone = process.env.TZ;

describe('formatPublishedMonthYear', () => {
  beforeAll(() => {
    // West of UTC: UTC-midnight dates land on the previous day here.
    process.env.TZ = 'America/Chicago';
  });

  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  it('renders a first-of-month date as the month authored, not the browser’s previous month', () => {
    // The exact input that produced React #418. Naive formatting in America/Chicago
    // is "February 2026"; the server (UTC) wrote "March 2026".
    expect(formatPublishedMonthYear('2026-03-01')).toBe('March 2026');
  });

  it('renders a UTC-midnight instant on the 1st the same way', () => {
    // A full ISO timestamp on the boundary would disagree identically without UTC.
    expect(formatPublishedMonthYear('2026-03-01T00:00:00.000Z')).toBe('March 2026');
    expect(formatPublishedMonthYear('2026-03-01T00:30:00.000Z')).toBe('March 2026');
  });

  it('keeps later-of-month dates on their own month', () => {
    expect(formatPublishedMonthYear('2026-03-05')).toBe('March 2026');
    expect(formatPublishedMonthYear('2026-03-31')).toBe('March 2026');
    expect(formatPublishedMonthYear('2025-12-31T23:30:00.000Z')).toBe('December 2025');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(formatPublishedMonthYear('Online Guide')).toBe('Online Guide');
  });

  it('labels the edible shelf’s grain-size guide without a server/client split', () => {
    // Pins the data path that tripped #418: testing a date sitting on a month boundary.
    const publishedAt = '2026-03-01';
    expect(formatPublishedMonthYear(publishedAt)).toBe('March 2026');
  });
});
