import { describe, expect, it } from 'vitest';
import { boxCount, piecesFromBoxes, pricePerBox } from './boxes';

describe('wholesale boxes preserve piece-based stock and pricing', () => {
  it.each([[6, 24], [4, 16], [1, 4]])('converts four boxes of %i pieces to %i genuine pieces', (pack, pieces) => {
    expect(piecesFromBoxes(4, pack)).toBe(pieces);
    expect(boxCount(pieces, pack)).toBe(4);
  });
  it('preserves loose stock without treating ten pieces as ten boxes', () => {
    expect(piecesFromBoxes(1, 6, 4)).toBe(10);
    expect(piecesFromBoxes(2, 4, 2)).toBe(10);
    expect(piecesFromBoxes(0, 6, 0)).toBe(0);
  });
  it('rejects fractional boxes, unknown packs, excessive remainders and unsafe quantities', () => {
    for (const args of [[1.5, 6, 0], [4, 0, 0], [1, 6, 6], [-1, 6, 0], [Number.MAX_SAFE_INTEGER, 6, 0]]) {
      expect(() => piecesFromBoxes(args[0], args[1], args[2])).toThrow();
    }
  });
  it('quotes boxes at the stored piece prices without repricing retail or wholesale', () => {
    expect(pricePerBox(9.07, 6)).toBe(54.42);
    expect(pricePerBox(13.97, 4)).toBe(55.88);
    expect(pricePerBox(34.97, 1)).toBe(34.97);
  });
});
