import { describe, expect, it } from 'vitest';

import {
  addressSuggestionFields,
  buildAddressVariants,
  normalizeStreetLine,
  tidySuggestedAddress,
} from './suggestions';
import type { CheckoutShippingAddress } from '@/lib/shippo/types';

const base: CheckoutShippingAddress = {
  fullName: 'Khan salman',
  addressLine1: 'BLOCK DR 4027',
  addressLine2: 'apt 216',
  city: 'IRVING',
  state: 'TX',
  postalCode: '75038',
  country: 'United States',
};

describe('normalizeStreetLine', () => {
  it('moves a house number typed after the street name to the front', () => {
    expect(normalizeStreetLine('BLOCK DR 4027', 'apt 216', '75038')).toEqual({
      line1: '4027 BLOCK DR',
      line2: 'apt 216',
    });
  });

  it('moves a unit typed on line 1 to line 2', () => {
    expect(normalizeStreetLine('BLOCK DR 4027 APT 216', '', '75038')).toEqual({
      line1: '4027 BLOCK DR',
      line2: 'APT 216',
    });
  });

  it('drops a unit repeated on both lines instead of mistaking it for a house number', () => {
    expect(normalizeStreetLine('4027 BLOCK DR APT 216', 'apt 216', '75038')).toEqual({
      line1: '4027 BLOCK DR',
      line2: 'apt 216',
    });
  });

  it('leaves a number-first address alone', () => {
    expect(normalizeStreetLine('4027 Block Dr', 'Apt 216', '75038')).toEqual({
      line1: '4027 Block Dr',
      line2: 'Apt 216',
    });
  });

  it('does not reverse a PO box', () => {
    expect(normalizeStreetLine('PO BOX 1234', '', '75038')).toEqual({
      line1: 'PO BOX 1234',
      line2: undefined,
    });
  });
});

describe('buildAddressVariants', () => {
  it('includes the normalized correction and an expanded suffix, without duplicates', () => {
    const variants = buildAddressVariants(base);
    expect(variants[0]).toEqual(base);
    expect(variants.map((variant) => variant.addressLine1)).toEqual([
      'BLOCK DR 4027',
      '4027 BLOCK DR',
      '4027 BLOCK DRIVE',
    ]);
  });

  it('does not add variants that are identical to the original', () => {
    const variants = buildAddressVariants({
      ...base,
      addressLine1: '4027 Block Dr',
    });
    expect(variants).toHaveLength(2);
    expect(variants[1].addressLine1).toBe('4027 Block Drive');
  });
});

describe('tidySuggestedAddress', () => {
  it('moves a unit repeated in both street lines back onto line 2', () => {
    expect(
      tidySuggestedAddress({
        ...base,
        addressLine1: '4027 Block Dr Apt 216',
        addressLine2: 'Apt 216',
      }),
    ).toEqual({
      ...base,
      addressLine1: '4027 Block Dr',
      addressLine2: 'Apt 216',
    });
  });

  it('leaves an ordinary two-line address alone', () => {
    const address = { ...base, addressLine1: '4027 Block Dr', addressLine2: 'Apt 216' };
    expect(tidySuggestedAddress(address)).toEqual(address);
  });
});

describe('addressSuggestionFields', () => {
  it('lists only the fields the carrier corrected', () => {
    const fields = addressSuggestionFields(
      {
        ...base,
        addressLine1: '4027 Block Dr',
        addressLine2: '',
        city: 'Irving',
      },
      {
        ...base,
        addressLine1: '4027 Block Dr Apt 216',
        addressLine2: 'Apt 216',
        city: 'Irving',
        postalCode: '75038-7733',
      },
    );

    expect(fields.map((field) => field.key)).toEqual(['addressLine1', 'addressLine2', 'postalCode']);
    expect(fields.find((field) => field.key === 'postalCode')?.suggested).toBe('75038-7733');
  });

  it('ignores differences that are only casing', () => {
    expect(
      addressSuggestionFields(
        { ...base, city: 'Irving', addressLine1: '4027 Block Dr', addressLine2: 'Apt 216' },
        { ...base, city: 'IRVING', addressLine1: '4027 BLOCK DR', addressLine2: 'APT 216' },
      ),
    ).toEqual([]);
  });
});
