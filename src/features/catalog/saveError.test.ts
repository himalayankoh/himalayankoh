import { describe, expect, it } from 'vitest';

import { humanSaveError } from './saveError';

describe('humanSaveError', () => {
  it('names the duplicate-SKU case, which the editor used to show nothing for', () => {
    expect(humanSaveError('product_invalid_sku: Invalid or duplicated SKU')).toMatch(/already in use/);
  });

  it('names a rejected value without blaming a field it cannot identify', () => {
    expect(humanSaveError('rest_invalid_param: Invalid parameter(s): status')).toMatch(/rejected one of the values/);
  });

  it('keeps a message it does not recognise, rather than inventing a cause', () => {
    expect(humanSaveError('Something the store said that is not in the table')).toBe(
      'Something the store said that is not in the table'
    );
  });

  it('falls back to the caller’s sentence when the store said nothing', () => {
    expect(humanSaveError('')).toBe('The save failed. Nothing was changed.');
    expect(humanSaveError(undefined, 'Could not save this product.')).toBe('Could not save this product.');
  });

  it('recognises a timeout as unconfirmed, which is not the same as unchanged', () => {
    expect(humanSaveError('The operation was aborted')).toMatch(/not confirmed/);
  });
});
