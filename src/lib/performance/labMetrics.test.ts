import { describe, expect, it } from 'vitest';
import { largestShiftSession } from './labMetrics';
describe('CLS measurement', () => {
  it('ignores shifts caused by a recent interaction', () => {
    expect(largestShiftSession([{ startTime: 0, value: 0.5, hadRecentInput: true }])).toBe(0);
  });
  it('keeps the largest session instead of summing separated shifts', () => {
    expect(largestShiftSession([{ startTime: 0, value: 0.02 }, { startTime: 300, value: 0.03 }, { startTime: 1800, value: 0.04 }])).toBe(0.05);
  });
  it('limits a continuous session to five seconds', () => {
    expect(largestShiftSession(Array.from({ length: 10 }, (_, i) => ({ startTime: i * 900, value: 0.01 })))).toBeCloseTo(0.06);
  });
});
