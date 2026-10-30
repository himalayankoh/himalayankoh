import { describe, expect, it } from 'vitest';
import { isNicheProduct } from './niche';

/**
 * The owner's explicit storefront approval.
 *
 * The niche guard judges *text*, and the shop's own livestock-shaped lines fail
 * it ("Salt Licks for Horses"). Until now the only way out was an authorised SKU
 * or a code edit; this is the per-product decision the owner records from the
 * console, with the same standing as the SKU list — and a refusal still outranks
 * it, so an approval can never re-admit a rejected record.
 */
describe('storefront niche — owner approval', () => {
  const horseLick = { name: 'Himalayan Pink Salt Licks for Horses', category: 'Salt Licks', sku: null };

  it('withholds an animal-named product with no approval', () => {
    expect(isNicheProduct(horseLick)).toBe(false);
  });

  it('admits it once the owner approves it', () => {
    expect(isNicheProduct({ ...horseLick, id: 2721, ownerApproved: true })).toBe(true);
  });

  it('treats an explicit false/null approval as no approval', () => {
    expect(isNicheProduct({ ...horseLick, ownerApproved: false })).toBe(false);
    expect(isNicheProduct({ ...horseLick, ownerApproved: null })).toBe(false);
  });

  it('never lets an approval re-admit a record the owner rejected', () => {
    // 2352 (SALT LICKS) is on OWNER_REJECTED_PRODUCT_IDS. 2321 used to be the
    // example here; it left that list on 2026-10-09, when the owner admitted it
    // for the live launch, so it is no longer a refusal to outrank.
    expect(isNicheProduct({ id: 2352, name: 'Himalayan Rock Salt Pouches', ownerApproved: true })).toBe(false);
  });

  it('still honours the authorised-SKU half of the policy', () => {
    expect(isNicheProduct({ name: 'Salt Licks for Horses', sku: 'HK-LFH-6lbs' })).toBe(true);
  });
});
