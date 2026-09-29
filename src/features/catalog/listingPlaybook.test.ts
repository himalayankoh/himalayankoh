import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_IMAGES,
  PLAYBOOK_VERSION,
  defaultListingPlaybook,
  effectiveStatusForImport,
  normalizeListingPlaybook,
  rulesForCategory,
  validateListingAgainstPlaybook,
} from './listingPlaybook';

/**
 * The minimum image count this app demands.
 *
 * It shipped as 3 for a while, and a save that could not satisfy it was refused
 * outright — the owner's name, SKU and price went down with the publish attempt,
 * which is how "nothing saves" happened. These pin the two halves of the fix:
 * the minimum is 2, and a listing that misses it is not an error unless it is
 * trying to go live.
 */
describe('Listing Playbook — minimum images', () => {
  it('ships a minimum of 2, globally, per category and for automation', () => {
    const pb = defaultListingPlaybook();
    expect(DEFAULT_MIN_IMAGES).toBe(2);
    expect(pb.global.minImages).toBe(2);
    expect(pb.automation.minImages).toBe(2);
    for (const key of Object.keys(pb.categories)) {
      expect(pb.categories[key].minImages).toBe(2);
    }
    expect(rulesForCategory(pb, 'Salt Licks').minImages).toBe(2);
    expect(rulesForCategory(pb, null).minImages).toBe(2);
  });

  it('publishes a two-image listing and holds a one-image listing as Draft', () => {
    const pb = defaultListingPlaybook();

    const two = validateListingAgainstPlaybook(pb, {
      status: 'active',
      images: [{ url: 'https://example.com/a.jpg' }, { url: 'https://example.com/b.jpg' }],
    });
    expect(two.ok).toBe(true);
    expect(two.errors).toEqual([]);

    const one = validateListingAgainstPlaybook(pb, {
      status: 'active',
      images: [{ url: 'https://example.com/a.jpg' }],
    });
    expect(one.ok).toBe(false);
    expect(one.errors.join(' ')).toContain('Only 1/2 images');

    // Saving the same listing as a draft is never an error — just a warning
    // about it staying a draft, which is exactly what the editor now writes.
    const draft = validateListingAgainstPlaybook(pb, {
      status: 'draft',
      images: [{ url: 'https://example.com/a.jpg' }],
    });
    expect(draft.ok).toBe(true);
    expect(draft.warnings.join(' ')).toContain('Product stays Draft');
  });

  it('creates an import as Active from two verified images', () => {
    const pb = defaultListingPlaybook();
    expect(effectiveStatusForImport(pb, 'Other', 2, 'active')).toBe('active');
    expect(effectiveStatusForImport(pb, 'Other', 1, 'active')).toBe('draft');
  });

  it('moves a stored v1 playbook off the old 3-image default, once', () => {
    const storedV1 = {
      version: 1,
      global: { minImages: 3, maxImages: 5 },
      categories: { Other: { minImages: 3, maxImages: 5 }, Dog: { minImages: 4 } },
      automation: { minImages: 3 },
    };

    const migrated = normalizeListingPlaybook(storedV1);
    expect(PLAYBOOK_VERSION).toBe(2);
    expect(migrated.version).toBe(PLAYBOOK_VERSION);
    expect(migrated.global.minImages).toBe(2);
    expect(migrated.categories.Other.minImages).toBe(2);
    expect(migrated.automation.minImages).toBe(2);
    // A minimum the owner chose (4) is theirs: the migration only moves the value
    // that was the shipped default.
    expect(migrated.categories.Dog.minImages).toBe(4);

    // Once the playbook is on the current version, a deliberate 3 stands.
    const kept = normalizeListingPlaybook({
      ...storedV1,
      version: PLAYBOOK_VERSION,
      global: { minImages: 3 },
      categories: { Other: { minImages: 3 } },
      automation: { minImages: 3 },
    });
    expect(kept.global.minImages).toBe(3);
    expect(kept.categories.Other.minImages).toBe(3);
    expect(kept.automation.minImages).toBe(3);
  });
});
