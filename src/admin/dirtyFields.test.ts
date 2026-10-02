import { describe, expect, it } from 'vitest';
import { createDirtyFields } from './dirtyFields';

/**
 * The case that matters is the SEO tab's: mark, then save, in one tick, and the
 * save has to see the mark. A `useState` set does not — it answers with the
 * previous render's fields — so this is pinned here rather than only in the
 * screen that hit it.
 */
describe('createDirtyFields', () => {
  it('sees a mark made in the same tick, before any re-render', () => {
    const dirty = createDirtyFields();

    dirty.mark('seoTitle');
    dirty.mark('seoDescription');

    expect(dirty.has('seoTitle')).toBe(true);
    expect(dirty.has('seoDescription')).toBe(true);
    expect(dirty.has('seoKeywords')).toBe(false);
    expect(dirty.size()).toBe(2);
  });

  it('counts a field once however often it is edited', () => {
    const dirty = createDirtyFields(['name']);

    dirty.mark('name');
    dirty.mark('seoTitle');

    expect(dirty.size()).toBe(2);
    expect(dirty.has('name')).toBe(true);
  });

  it('forgets every field on clear, including marked-but-unsaved ones', () => {
    const dirty = createDirtyFields();
    dirty.mark('price');
    dirty.mark('seoTitle');

    dirty.clear();

    expect(dirty.size()).toBe(0);
    expect(dirty.has('price')).toBe(false);
    expect(dirty.has('seoTitle')).toBe(false);
  });

  it('keeps one editor\'s edits out of another\'s save', () => {
    const first = createDirtyFields();
    const second = createDirtyFields();

    first.mark('seoTitle');

    expect(second.has('seoTitle')).toBe(false);
    expect(second.size()).toBe(0);
  });

  it('accepts fields it starts with, so a loaded form can begin dirty', () => {
    const dirty = createDirtyFields(['images']);

    expect(dirty.has('images')).toBe(true);
    expect(dirty.size()).toBe(1);
  });
});
