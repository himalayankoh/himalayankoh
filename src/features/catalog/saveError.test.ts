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

  it('names the image WooCommerce could not download, which its own message hides', () => {
    // Exactly what product 2683's save came back with: the store's sentence ends
    // in a bare "Error:", so the owner could not tell which image or what to do.
    const raw =
      'Product 2683 could not be updated: WordPress error woocommerce_product_image_upload_error: ' +
      'Error getting remote image https://himalayankoh.com/staging/wp-content/uploads/2026/09/4da5dc89-fab2-42c8-aadb-768ce42ac24e.png. Error:';

    const said = humanSaveError(raw);
    expect(said).toContain(
      'https://himalayankoh.com/staging/wp-content/uploads/2026/09/4da5dc89-fab2-42c8-aadb-768ce42ac24e.png'
    );
    expect(said).toMatch(/whole save/);
    expect(said).toMatch(/uploader/);
    expect(said).not.toMatch(/Error:$/);
  });

  it('falls back to the caller’s sentence when the store said nothing', () => {
    expect(humanSaveError('')).toBe('The save failed. Nothing was changed.');
    expect(humanSaveError(undefined, 'Could not save this product.')).toBe('Could not save this product.');
  });

  it('recognises a timeout as unconfirmed, which is not the same as unchanged', () => {
    expect(humanSaveError('The operation was aborted')).toMatch(/not confirmed/);
  });
});
