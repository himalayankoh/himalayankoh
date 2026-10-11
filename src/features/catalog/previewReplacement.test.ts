import { describe, expect, it } from 'vitest';
import { previewCopy, sourceSnapshot } from '../../../scripts/lib/previewReplacement.mjs';

const units = { liveWeight: 'kg', previewWeight: 'lbs', liveDimensions: 'cm', previewDimensions: 'in' };
const source = () => ({ id: 2721, sku: 'HK-LFH-2lbs', name: 'Original horse salt lick',
  slug: 'original-lick', type: 'simple', status: 'publish', price: '19.95', regular_price: '19.95',
  sale_price: '', weight: '2', dimensions: { length: '10', width: '', height: '6' },
  stock_quantity: 10, manage_stock: true, stock_status: 'instock',
  description: '<p>Original description</p>', short_description: 'Original summary',
  images: [{ id: 8, src: 'https://wp.himalayankoh.com/staging/wp-content/uploads/2026/10/lick.jpg', name: 'lick', alt: 'Horse lick' }],
  attributes: [], meta_data: [{ key: '_himalayan_koh_specifications', value: '{"weightLbs":6,"weightOz":96}' },
    { key: '_himalayan_koh_delivery_min_days', value: '3' }, { key: '_himalayan_koh_delivery_max_days', value: '7' }] });

describe('literal preview replacement safety', () => {
  it('ignores Woo randomized recommendations but still detects real source edits', () => {
    expect(sourceSnapshot([{ ...source(), related_ids: [1, 2] }]))
      .toEqual(sourceSnapshot([{ ...source(), related_ids: [2, 1] }]));
    expect(sourceSnapshot([{ ...source(), regular_price: '99.95' }]))
      .not.toEqual(sourceSnapshot([source()]));
  });
  it('copies the real simple product without carrying foreign IDs or contradictory delivery/weight metadata', () => {
    const original = source();
    const copy = previewCopy(original, units);
    expect(copy).toMatchObject({ type: 'simple', name: original.name, description: original.description,
      short_description: original.short_description, regular_price: '19.95', stock_quantity: 10, weight: '0.907185',
      dimensions: { length: '25.4', width: '', height: '15.24' } });
    expect(copy).not.toHaveProperty('id');
    expect(copy.images[0]).not.toHaveProperty('id');
    expect(copy.images[0].src).toBe(original.images[0].src);
    expect(copy.meta_data.some((m: { key: string }) => m.key.includes('delivery'))).toBe(false);
    expect(JSON.parse(copy.meta_data.find((m: { key: string }) => m.key.endsWith('specifications')).value))
      .toEqual({ weightLbs: 2, weightOz: 32 });
    expect(original.meta_data[0].value).toBe('{"weightLbs":6,"weightOz":96}');
  });
  it('rejects changed units, unapproved source IDs, and foreign photographs', () => {
    expect(() => previewCopy(source(), { ...units, liveWeight: 'lbs' })).toThrow('unit');
    expect(() => previewCopy({ ...source(), id: 1548 }, units)).toThrow('approved');
    expect(() => previewCopy({ ...source(), images: [{ src: 'https://other.example/photo.jpg' }] }, units)).toThrow('image');
  });
  it('uses the owner-confirmed one-pound weight for the 16 oz jar', () => {
    const jar = { ...source(), id: 2653, sku: 'HK-ESF-16oz', weight: '', meta_data: [] };
    expect(previewCopy(jar, units).weight).toBe('0.453592');
  });
});
