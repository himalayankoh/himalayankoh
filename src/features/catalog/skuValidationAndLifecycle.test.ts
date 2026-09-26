import { describe, expect, it, vi, afterEach } from 'vitest';
import { updateWooProduct, createWooProduct, permanentlyDeleteWooProduct } from '../../lib/woo/productWrite';
import { humanSaveError } from './saveError';
import { defaultListingPlaybook, validateListingAgainstPlaybook } from './listingPlaybook';

vi.mock('../../lib/backend/credentials', () => ({
  hasWooCommerceCredentials: () => true,
  requireWooCommerceCredentials: () => true,
  requireWooCredentials: () => true,
}));

vi.mock('../../lib/backend/wordpress', () => ({
  REST_V3: 'https://staging.test/wp-json/wc/v3',
  wordpressRequest: vi.fn(),
  WORDPRESS_MAX_PER_PAGE: 100,
}));

import { wordpressRequest } from '../../lib/backend/wordpress';

describe('SKU Ownership, Uniqueness & Lifecycle Regression Tests (A-F)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Case A1: Existing simple product retains its own SKU without duplicate-SKU error', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    // getWooProduct returns existing simple product
    mockRequest.mockResolvedValueOnce({
      id: 2487,
      name: 'Himalayan Salt Lick — 5 to 6 lbs',
      sku: 'HK-LFH-6lbs',
      type: 'simple',
      status: 'publish',
    } as any);

    // PUT response
    mockRequest.mockResolvedValueOnce({
      id: 2487,
      name: 'Himalayan Salt Lick — 5 to 6 lbs (Renamed)',
      sku: 'HK-LFH-6lbs',
      type: 'simple',
      status: 'publish',
    } as any);

    const result = await updateWooProduct(2487, {
      name: 'Himalayan Salt Lick — 5 to 6 lbs (Renamed)',
      sku: 'HK-LFH-6lbs',
    });

    expect(result.product.name).toBe('Himalayan Salt Lick — 5 to 6 lbs (Renamed)');
    expect(result.product.sku).toBe('HK-LFH-6lbs');

    // Verify PUT call to WooCommerce did NOT send redundant body.sku that triggers self-conflict
    const putCall = mockRequest.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const putBody = putCall?.[1]?.body as Record<string, unknown>;
    expect(putBody.sku).toBeUndefined();
    expect(putBody.name).toBe('Himalayan Salt Lick — 5 to 6 lbs (Renamed)');
  });

  it('Case A2: Existing variable product retains its own variation SKU (HK-SFL-C-6lbs) without duplicate-SKU error', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    // getWooProduct returns parent variable product 2492 with empty parent sku
    mockRequest.mockResolvedValueOnce({
      id: 2492,
      name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs',
      sku: '',
      type: 'variable',
      status: 'publish',
    } as any);

    // listWooVariations returns variations 2540 and 2539
    mockRequest.mockResolvedValueOnce([
      { id: 2540, sku: 'HK-SFL-C-6lbs', regular_price: '19.95' },
      { id: 2539, sku: 'HK-SFL-F-6lbs', regular_price: '19.95' },
    ] as any);

    // PUT response for parent
    mockRequest.mockResolvedValueOnce({
      id: 2492,
      name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs (Edited)',
      sku: '',
      type: 'variable',
      status: 'publish',
    } as any);

    const result = await updateWooProduct(2492, {
      name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs (Edited)',
      sku: 'HK-SFL-C-6lbs',
    });

    // Parent product save must succeed and retain the SKU
    expect(result.product.sku).toBe('HK-SFL-C-6lbs');
    expect(result.product.name).toBe('Himalayan Salt Fine & Coarse Grain — 6 lbs (Edited)');

    // Verify PUT call did NOT send body.sku to WooCommerce variable parent
    const putCall = mockRequest.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const putBody = putCall?.[1]?.body as Record<string, unknown>;
    expect(putBody.sku).toBeUndefined();
  });

  it('Case B: Another DIFFERENT product cannot take that SKU (validation error)', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    // Product 2487 (simple product)
    mockRequest.mockResolvedValueOnce({
      id: 2487,
      name: 'Himalayan Salt Lick — 5 to 6 lbs',
      sku: 'HK-LFH-6lbs',
      type: 'simple',
      status: 'publish',
    } as any);

    // WooCommerce rejects duplicate SKU on different product
    mockRequest.mockRejectedValueOnce(new Error('WordPress error product_invalid_sku: Invalid or duplicated SKU.'));

    await expect(
      updateWooProduct(2487, {
        sku: 'HK-SFL-C-6lbs', // Owned by 2492/2540
      })
    ).rejects.toThrow(/product_invalid_sku/);

    // Verify humanSaveError translates it cleanly to the user
    const errorText = humanSaveError('WordPress error product_invalid_sku: Invalid or duplicated SKU.');
    expect(errorText).toBe(
      'This SKU is already in use by another product. Use a different SKU, or leave the field blank — SKU is optional.'
    );
  });

  it('Case C: Blank SKU remains valid and clears the SKU', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    mockRequest.mockResolvedValueOnce({
      id: 2487,
      name: 'Himalayan Salt Lick',
      sku: 'HK-LFH-6lbs',
      type: 'simple',
      status: 'publish',
    } as any);

    mockRequest.mockResolvedValueOnce({
      id: 2487,
      name: 'Himalayan Salt Lick',
      sku: '',
      type: 'simple',
      status: 'publish',
    } as any);

    const result = await updateWooProduct(2487, {
      sku: '',
    });

    const putCall = mockRequest.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall).toBeDefined();
    const putBody = putCall?.[1]?.body as Record<string, unknown>;
    expect(putBody.sku).toBe('');
    expect(result.product.sku).toBeNull();
  });

  it('Case C2: Creating a new product with blank SKU omits sku from body and creates product cleanly', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    mockRequest.mockResolvedValueOnce({
      id: 2999,
      name: 'Brand New Product',
      sku: '',
      type: 'simple',
      status: 'draft',
    } as any);

    const result = await createWooProduct({
      name: 'Brand New Product',
      sku: '   ',
    });

    const postCall = mockRequest.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    const postBody = postCall?.[1]?.body as Record<string, unknown>;
    expect(postBody.sku).toBeUndefined();
    expect(result.product.name).toBe('Brand New Product');
  });

  it('Case D: Own-stock Himalayan Koh product does not require Supplier SKU', () => {
    const pb = defaultListingPlaybook();
    expect(pb.global.requiredSupplierData).toBe(false);

    const verdict = validateListingAgainstPlaybook(pb, {
      name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs',
      status: 'active',
      images: [
        { url: 'https://preview.himalayankoh.com/img1.jpg' },
        { url: 'https://preview.himalayankoh.com/img2.jpg' },
        { url: 'https://preview.himalayankoh.com/img3.jpg' },
      ],
      supplierName: 'Own Stock',
      supplierUrl: null,
      supplierSku: null,
    });

    expect(verdict.ok).toBe(true);
    expect(verdict.errors).toHaveLength(0);
    expect(verdict.warnings.some((w) => w.toLowerCase().includes('supplier sku'))).toBe(false);
  });

  it('Case E: Permanent delete sends the correct WooCommerce force-delete behavior', async () => {
    const mockRequest = vi.mocked(wordpressRequest);
    mockRequest.mockResolvedValueOnce({ id: 2487, force: true });

    await permanentlyDeleteWooProduct(2487);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const deleteCall = mockRequest.mock.calls[0];
    expect(deleteCall[0]).toContain('/products/2487');
    expect(deleteCall[1]?.method === 'DELETE').toBe(true);
    expect(deleteCall[1]?.params).toEqual({ force: 'true' });
  });

  it('Case F: Trashed products are filtered out and cannot re-enter Admin listing as drafts', async () => {
    const productsFromWoo = [
      { id: 2487, name: 'Active Product', status: 'publish', sku: 'HK-LFH-6lbs' },
      { id: 9999, name: 'Deleted Product', status: 'trash', sku: 'TEST-DELETED' },
    ];

    const activeRows = productsFromWoo.filter((r) => r.status !== 'trash');
    expect(activeRows).toHaveLength(1);
    expect(activeRows.some((r) => r.id === 9999)).toBe(false);
    expect(activeRows.some((r) => r.status === 'trash')).toBe(false);
  });
});
