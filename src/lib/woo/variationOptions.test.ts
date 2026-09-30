import { describe, expect, it } from 'vitest';
import {
  findVariationOption,
  productVariations,
  variationOptionLabels,
  type RestV3Attribute,
} from './variationOptions';
import type { WooVariationLike } from './productPayload';

const GRAIN: RestV3Attribute = {
  id: 2,
  name: 'Grain Size',
  visible: true,
  variation: true,
  options: ['Fine Grain', 'Coarse Grain'],
};

const PACK: RestV3Attribute = {
  id: 6,
  name: 'Pack',
  visible: true,
  variation: true,
  options: ['3', '9'],
};

/** One variation as REST v3 reports it. */
function variation(overrides: Partial<WooVariationLike> = {}): WooVariationLike {
  return {
    id: 7002,
    regular_price: '19.95',
    sku: 'HK-SFL-C-6lbs',
    stock_status: 'instock',
    attributes: [{ name: 'Grain Size', option: 'Coarse Grain' }],
    ...overrides,
  };
}

function bothGrains(): WooVariationLike[] {
  return [
    variation({
      id: 7001,
      sku: 'HK-SFL-F-6lbs',
      attributes: [{ name: 'Grain Size', option: 'Fine Grain' }],
    }),
    variation(),
  ];
}

describe('WooCommerce option naming', () => {
  it('addresses the axis by its name and the option by the store\u2019s own string', () => {
    const variations = productVariations([GRAIN], bothGrains());

    // `pa_` + slugify is accepted for this axis only by luck: `Size/Weight` is the
    // registered `pa_block-weight`, and a custom attribute has no taxonomy at all.
    // The name and the option as written are the forms the store accepts for both.
    expect(variations?.options[0]).toMatchObject({
      attribute: 'Grain Size',
      label: 'Fine Grain',
      value: 'Fine Grain',
    });
  });

  it('addresses a global axis whose slug diverges from its name by that name', () => {
    const axis: RestV3Attribute = {
      id: 4,
      name: 'Size/Weight',
      variation: true,
      options: ['2 lbs.'],
    };
    const variations = productVariations([axis], [
      variation({ id: 7100, attributes: [{ name: 'Size/Weight', option: '2 lbs.' }] }),
    ]);

    // Deriving `pa_size-weight` here is refused by the store; the name is not.
    expect(variations?.options[0]).toMatchObject({ attribute: 'Size/Weight', value: '2 lbs.' });
  });

  it('addresses a custom attribute (id 0) by its name and raw option', () => {
    const axis: RestV3Attribute = {
      id: 0,
      name: 'Grain Type',
      variation: true,
      options: ['Fine Grain'],
    };
    const variations = productVariations([axis], [
      variation({ id: 7200, attributes: [{ name: 'Grain Type', option: 'Fine Grain' }] }),
    ]);

    // A custom attribute's options are not terms, so `fine-grain` would be refused.
    expect(variations?.options[0]).toMatchObject({
      attribute: 'Grain Type',
      value: 'Fine Grain',
    });
  });

  it('carries the variation’s own image, so the picture can follow the choice', () => {
    const variations = productVariations([GRAIN], [
      variation({
        id: 7001,
        attributes: [{ name: 'Grain Size', option: 'Fine Grain' }],
        image: { src: 'https://cdn.test/fine.webp' },
      }),
      variation({ id: 7002, image: null }),
    ]);

    expect(variations?.options[0].image).toBe('https://cdn.test/fine.webp');
    // A variation with no shot of its own reports none — the PDP then keeps the
    // product's gallery rather than showing another option's picture.
    expect(variations?.options[1].image).toBeNull();
  });

  it('offers nothing for an axis the cart could not be told about', () => {
    const unnamed: RestV3Attribute = { id: 0, name: '', variation: true, options: ['1kg'] };
    expect(productVariations([unnamed], [variation()])).toBeUndefined();
  });
});

describe('productVariations', () => {
  it('offers an option only when a variation is behind it', () => {
    const variations = productVariations([GRAIN], [
      variation({
        id: 7001,
        attributes: [{ name: 'Grain Size', option: 'Fine Grain' }],
      }),
    ]);

    // The parent declares both grains, but the coarse one has no variation — the
    // store cannot price or fulfil it, so the shopper is not offered it.
    expect(variations?.options.map((option) => option.label)).toEqual(['Fine Grain']);
  });

  it('carries the id, the pair and the price a cart line needs', () => {
    const variations = productVariations([GRAIN], bothGrains());

    expect(variations?.attributeLabel).toBe('Grain Size');
    expect(variations?.options[0]).toEqual({
      id: 7001,
      attribute: 'Grain Size',
      label: 'Fine Grain',
      value: 'Fine Grain',
      price: 19.95,
      sku: 'HK-SFL-F-6lbs',
      inStock: true,
      image: null,
    });
  });

  it('prefers the sale price, which is what the customer pays', () => {
    const variations = productVariations([GRAIN], [
      variation({ sale_price: '17.95', regular_price: '19.95' }),
    ]);

    expect(variations?.options[0].price).toBe(17.95);
  });

  it('treats an out-of-stock variation as not purchasable, and unknown as not either', () => {
    const variations = productVariations([GRAIN], [
      variation({
        id: 7001,
        stock_status: 'outofstock',
        attributes: [{ name: 'Grain Size', option: 'Fine Grain' }],
      }),
      variation({ id: 7002, stock_status: undefined }),
    ]);

    expect(variations?.options.map((option) => option.inStock)).toEqual([false, false]);
  });

  it('picks the grain axis when the product varies on more than one', () => {
    const variations = productVariations([PACK, GRAIN], [
      variation({ id: 7001, attributes: [{ name: 'Pack', option: '3' }] }),
      variation({ id: 7002 }),
    ]);

    expect(variations?.attributeLabel).toBe('Grain Size');
    expect(variations?.options.map((option) => option.id)).toEqual([7002]);
  });

  it('does not confuse two axes that share an option name', () => {
    const packAxis: RestV3Attribute = { id: 9, name: 'Size ', variation: true, options: ['3'] };
    const variations = productVariations([packAxis], [
      variation({ id: 7003, attributes: [{ name: 'Pack', option: '3' }] }),
    ]);

    expect(variations).toBeUndefined();
  });

  it('reports no choices for a simple product', () => {
    expect(productVariations(undefined, [])).toBeUndefined();
    expect(productVariations([{ id: 2, name: 'Grain Size', options: ['Fine Grain'] }], [])).toBeUndefined();
    expect(productVariations([], [variation()])).toBeUndefined();
  });

  it('ignores a variation lacking an id rather than offering a dead option', () => {
    expect(productVariations([GRAIN], [variation({ id: undefined })])).toBeUndefined();
  });

  it('labels the axis options for the selector, and nothing when there are none', () => {
    expect(variationOptionLabels(productVariations([GRAIN], bothGrains()))).toEqual([
      'Fine Grain',
      'Coarse Grain',
    ]);
    expect(variationOptionLabels(undefined)).toBeUndefined();
  });

  it('finds the option a label refers to, and refuses an unknown one', () => {
    const variations = productVariations([GRAIN], bothGrains());

    expect(findVariationOption(variations, 'Coarse Grain')?.value).toBe('Coarse Grain');
    // A label the store does not offer must produce nothing to send, not a guess.
    expect(findVariationOption(variations, 'Medium Grain')).toBeUndefined();
    expect(findVariationOption(variations, undefined)).toBeUndefined();
  });
});
