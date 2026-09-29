// ============================================================================
// Admin rail width
//
// How much of the screen the admin menu takes is a property of the screen, not
// of the store, so this preference lives in localStorage per device. It used to
// be a two-state toggle ('full' | 'mini'); the rail is now draggable, so the
// stored value is a pixel width. The old two names are still read so a browser
// that saved a choice before the rail became draggable keeps it.
//
// Icons-only mode is *derived* from the width rather than stored beside it: a
// rail dragged narrower than its labels cannot show them, whatever was toggled
// last, and two settings that can disagree always eventually do.
// ============================================================================

export const RAIL_STORAGE_KEY = 'hk_admin_rail_v1';

/** The default rail, and the width the header toggle restores. */
export const RAIL_DEFAULT_WIDTH = 240;
/** Icons-only floor — narrower would clip the icons themselves. */
export const RAIL_MIN_WIDTH = 72;
/** Past this the rail eats workspace for no benefit. */
export const RAIL_MAX_WIDTH = 340;
/** Below this the labels stop fitting, so the rail falls back to icons only. */
export const RAIL_LABEL_MIN_WIDTH = 184;
/** One arrow-key nudge. */
export const RAIL_WIDTH_STEP = 16;

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** Round into the draggable band. Anything unreadable becomes the default. */
export function clampRailWidth(width: number): number {
  if (!Number.isFinite(width)) return RAIL_DEFAULT_WIDTH;
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

export function isMiniRail(width: number): boolean {
  return width < RAIL_LABEL_MIN_WIDTH;
}

export function loadRailWidth(storage?: ReadableStorage | null): number {
  if (!storage) return RAIL_DEFAULT_WIDTH;
  try {
    const raw = storage.getItem(RAIL_STORAGE_KEY);
    if (!raw) return RAIL_DEFAULT_WIDTH;
    const value = raw.trim().toLowerCase();
    if (value === 'mini') return RAIL_MIN_WIDTH;
    if (value === 'full') return RAIL_DEFAULT_WIDTH;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return RAIL_DEFAULT_WIDTH;
    return clampRailWidth(parsed);
  } catch {
    // Private mode / blocked storage: the caller keeps its current width.
    return RAIL_DEFAULT_WIDTH;
  }
}

/** Persist a width and return the value that actually applied. */
export function saveRailWidth(width: number, storage?: WritableStorage | null): number {
  const next = clampRailWidth(width);
  if (!storage) return next;
  try {
    storage.setItem(RAIL_STORAGE_KEY, String(next));
  } catch {
    // A preference that cannot be stored still applies for this session.
  }
  return next;
}
