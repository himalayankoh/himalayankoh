import { describe, expect, it, vi } from 'vitest';
import {
  RAIL_DEFAULT_WIDTH,
  RAIL_LABEL_MIN_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_STORAGE_KEY,
  clampRailWidth,
  isMiniRail,
  loadRailWidth,
  saveRailWidth,
} from './railWidth';

/** A localStorage stand-in that records what was written. */
function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    read: (key: string) => store.get(key) ?? null,
  };
}

describe('clampRailWidth', () => {
  it('holds the width inside the draggable band', () => {
    expect(clampRailWidth(RAIL_MIN_WIDTH - 40)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(RAIL_MAX_WIDTH + 40)).toBe(RAIL_MAX_WIDTH);
    expect(clampRailWidth(260)).toBe(260);
  });

  it('rounds the fractional widths a drag produces, and defaults junk', () => {
    expect(clampRailWidth(259.6)).toBe(260);
    expect(clampRailWidth(Number.NaN)).toBe(RAIL_DEFAULT_WIDTH);
    expect(clampRailWidth(Number.POSITIVE_INFINITY)).toBe(RAIL_DEFAULT_WIDTH);
  });
});

describe('isMiniRail', () => {
  it('flips to icons-only once the labels stop fitting', () => {
    expect(isMiniRail(RAIL_MIN_WIDTH)).toBe(true);
    expect(isMiniRail(RAIL_LABEL_MIN_WIDTH - 1)).toBe(true);
    expect(isMiniRail(RAIL_LABEL_MIN_WIDTH)).toBe(false);
    expect(isMiniRail(RAIL_DEFAULT_WIDTH)).toBe(false);
  });
});

describe('loadRailWidth', () => {
  it('falls back to the default with no storage or nothing stored', () => {
    expect(loadRailWidth(null)).toBe(RAIL_DEFAULT_WIDTH);
    expect(loadRailWidth(undefined)).toBe(RAIL_DEFAULT_WIDTH);
    expect(loadRailWidth(fakeStorage())).toBe(RAIL_DEFAULT_WIDTH);
  });

  it('reads the two names a pre-drag browser may have saved', () => {
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: 'mini' }))).toBe(RAIL_MIN_WIDTH);
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: 'full' }))).toBe(RAIL_DEFAULT_WIDTH);
  });

  it('clamps a stored width and ignores values that are not numbers', () => {
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: '300' }))).toBe(300);
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: ' 212 ' }))).toBe(212);
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: '9000' }))).toBe(RAIL_MAX_WIDTH);
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: '4' }))).toBe(RAIL_MIN_WIDTH);
    expect(loadRailWidth(fakeStorage({ [RAIL_STORAGE_KEY]: 'wide' }))).toBe(RAIL_DEFAULT_WIDTH);
  });

  it('survives storage that throws instead of forcing a crash on load', () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    expect(loadRailWidth(blocked)).toBe(RAIL_DEFAULT_WIDTH);
  });
});

describe('saveRailWidth', () => {
  it('round-trips a width through storage, clamped', () => {
    const storage = fakeStorage();
    expect(saveRailWidth(268.4, storage)).toBe(268);
    expect(storage.read(RAIL_STORAGE_KEY)).toBe('268');
    expect(loadRailWidth(storage)).toBe(268);
  });

  it('returns the applied width even when it cannot be stored', () => {
    const blocked = {
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    expect(saveRailWidth(500, blocked)).toBe(RAIL_MAX_WIDTH);
    expect(saveRailWidth(300, null)).toBe(300);
  });
});
