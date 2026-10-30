import { describe, expect, it, vi } from 'vitest';
import { measurementsForAdmin, measurementsForWoo, readStoreMeasurements } from './adminMeasurements';
import { fromWooProduct } from './productPayload';
vi.mock('../backend/wordpress', () => ({ wordpressRequest: vi.fn().mockResolvedValue([]) }));

describe('admin lb/in boundary against native Woo units', () => {
  const units = { weight: 'kg', dimension: 'cm' };
  it('displays the real 30 lb product and its original inch dimensions', () => {
    const record = fromWooProduct({ id: 2544, weight: '13.607771', dimensions: { length: '21.59', width: '19.05', height: '16.51' } });
    const display = measurementsForAdmin(record, units);
    expect(display.weight).toBeCloseTo(30, 5);
    expect(display.dimensions).toEqual({ length: 8.5, width: 7.5, height: 6.5 });
    expect(record.weight).toBe(13.607771);
    const saved = measurementsForWoo({ weight: display.weight, dimensions: display.dimensions }, units);
    expect(saved).toEqual({ weight: 13.607771, dimensions: { length: 21.59, width: 19.05, height: 16.51 } });
  });
  it('keeps absent fields and explicit clears distinct', () => {
    expect(measurementsForWoo({ name: 'Salt' }, units)).toEqual({ name: 'Salt' });
    expect(measurementsForWoo({ weight: null, dimensions: { width: null } }, units)).toEqual({ weight: null, dimensions: { width: null } });
  });
  it('supports pounds/inches and grams/millimeters without changing product prices', () => {
    expect(measurementsForWoo({ weight: 2, price: 19.95 }, { weight: 'lbs', dimension: 'in' })).toEqual({ weight: 2, price: 19.95 });
    expect(measurementsForWoo({ weight: 1, dimensions: { length: 10 } }, { weight: 'g', dimension: 'mm' })).toEqual({ weight: 453.59237, dimensions: { length: 254 } });
  });
  it('refuses unverified settings instead of assuming pounds', async () => {
    await expect(readStoreMeasurements()).rejects.toThrow('measurement units could not be verified');
  });
});
