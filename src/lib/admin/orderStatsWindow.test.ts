import { describe, expect, it } from 'vitest';

import { STATS_WINDOW, pageCoversStatsWindow } from './orderStatsWindow';

describe('pageCoversStatsWindow', () => {
  it('reuses the page for the console’s own read (first page, asked for the window width)', () => {
    expect(pageCoversStatsWindow({ page: 1, perPage: STATS_WINDOW })).toBe(true);
    expect(pageCoversStatsWindow({ page: 1, perPage: 250 })).toBe(true);
  });

  it('reads separately when the page is narrower than the window', () => {
    // 25 orders cannot describe the newest 100.
    expect(pageCoversStatsWindow({ page: 1, perPage: 25 })).toBe(false);
    expect(pageCoversStatsWindow({ page: 1, perPage: STATS_WINDOW - 1 })).toBe(false);
  });

  it('reads separately when no width was asked for, since the default page is narrower', () => {
    expect(pageCoversStatsWindow({ page: 1 })).toBe(false);
  });

  it('never reports a filtered or later page as the store’s window', () => {
    // Counting a filtered slice as the store's totals would misstate revenue.
    expect(pageCoversStatsWindow({ page: 1, perPage: 100, status: 'processing' })).toBe(false);
    expect(pageCoversStatsWindow({ page: 1, perPage: 100, search: 'HK-ESF' })).toBe(false);
    expect(pageCoversStatsWindow({ page: 2, perPage: 100 })).toBe(false);
  });
});
