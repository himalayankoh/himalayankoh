import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdSenseReportCards, { type EarningsCache, type EarningsRange } from './AdSenseReportCards';

const range: EarningsRange = { earnings: 12.5, pageViews: 100, impressions: 200, clicks: 3, pageRpm: 125, impressionRpm: 62.5 };
const render = (ranges: EarningsCache['ranges'], currency: string | null = 'USD') =>
  renderToStaticMarkup(<AdSenseReportCards cache={{ syncedAt: '2026-10-10T00:00:00Z', currency, ranges }} />);

describe('AdSense report cards', () => {
  it.each([null, {}, { today: null, yesterday: null, last7: null, thisMonth: null, prevMonth: null }])(
    'renders missing reports without crashing or inventing zero earnings: %j', (ranges) => {
      const html = render(ranges);
      expect(html.match(/No data/g)).toHaveLength(10);
      expect(html).not.toContain('$0.00');
    },
  );

  it('keeps real values visible when another report is absent', () => {
    const html = render({ today: range, thisMonth: range, prevMonth: null });
    expect(html).toContain('$12.50');
    expect(html).toContain('>100<');
    expect(html.match(/No data/g)).toHaveLength(3);
  });

  it('distinguishes an actual reported zero from missing metrics', () => {
    const html = render({ thisMonth: { ...range, earnings: 0, pageViews: 0, clicks: null } });
    expect(html).toContain('$0.00');
    expect(html).toContain('>0<');
    expect(html.match(/No data/g)).toHaveLength(5);
  });

  it('does not invent a currency or render invalid metrics', () => {
    const html = render({ today: range, thisMonth: { ...range, pageViews: NaN, impressions: Infinity, clicks: -1 } }, null);
    expect(html.match(/No data/g)).toHaveLength(10);
    expect(html).not.toContain('$');
    expect(render({ today: range }, 'invalid')).not.toContain('$12.50');
  });
});
