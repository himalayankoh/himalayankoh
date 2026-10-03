/**
 * Himalayan Koh admin — the console's visual system.
 *
 * One owner for how the admin looks. Every surface, control and chip class is
 * decided here and composed by the shell, the primitives and the pages, so a
 * change to the console's appearance lands in one file instead of in a hundred
 * `className` strings that drift.
 *
 * Copper-rose navigation, a warm porcelain canvas, softly raised surfaces,
 * readable system typography and compact controls are shared across workspaces.
 *
 * Colours come from the `admin-*` design tokens in `app/globals.css`, so the
 * storefront's palette and utilities are untouched by anything in this folder.
 */

/**
 * The desktop canvas.
 *
 * The admin is a desktop tool: it keeps its sidebar, tables and dashboard grid
 * at every viewport instead of reflowing into a mobile layout. Below this width
 * the console scrolls horizontally rather than restacking.
 */
export const ADMIN_CANVAS_MIN_WIDTH = 1280;

/** Panel: the base surface every card, table and form section sits on. */
export const SURFACE =
  'admin-surface rounded-xl border border-admin-line bg-admin-surface shadow-sm';

/** The header strip inside a panel, above its body. */
export const SURFACE_HEADER =
  'flex flex-wrap items-start justify-between gap-3 border-b border-admin-line px-5 py-4';

/** The body of a panel. */
export const SURFACE_BODY = 'px-5 py-4';

/** Uppercase micro-label — stat tiles, table headers, section eyebrows. */
export const MICRO_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-admin-muted';

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export const CONTROL_BASE =
  'inline-flex items-center justify-center gap-2 min-h-10 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55';

export const BUTTON = {
  primary: `${CONTROL_BASE} admin-action-primary bg-himalayan px-4 py-2.5 text-white hover:bg-himalayan-dark`,
  secondary: `${CONTROL_BASE} border border-admin-line bg-admin-surface px-4 py-2.5 text-admin-ink hover:bg-admin-canvas`,
  ghost: `${CONTROL_BASE} px-3 py-2 text-admin-muted hover:bg-admin-canvas hover:text-admin-ink`,
  danger: `${CONTROL_BASE} bg-red-600 px-4 py-2.5 text-white hover:bg-red-700`,
  /** The console's high-emphasis action, on the near-black the reference console uses. */
  dark: `${CONTROL_BASE} bg-admin-ink px-4 py-2.5 text-white hover:opacity-90`,
} as const;

export const CONTROL_DISABLED_NOTE =
  'text-[11px] font-medium text-admin-muted';

const FIELD =
  'admin-field-control rounded-xl border border-admin-line bg-admin-surface px-3.5 text-sm text-admin-ink placeholder:text-admin-muted/70 focus:border-himalayan focus:outline-none focus:ring-2 focus:ring-himalayan/25';

export const INPUT = `${FIELD} py-2.5`;
export const SELECT = `${FIELD} py-2.5 pr-8`;
export const TEXTAREA = `${FIELD} py-2.5 resize-none`;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

export const TABLE_WRAP = 'w-full max-w-full overflow-x-auto overscroll-x-contain';
export const TABLE = 'w-full min-w-[640px] border-collapse tabular-nums';
export const TABLE_HEAD =
  'border-b border-admin-line bg-admin-canvas/70 text-left';
export const TH = `px-4 py-3 ${MICRO_LABEL} whitespace-nowrap`;
export const TABLE_BODY = 'divide-y divide-admin-line [&>tr:hover]:bg-admin-canvas/50';
export const ROW = 'transition-colors hover:bg-admin-canvas/60';
export const TD = 'px-4 py-3 align-middle text-sm text-admin-ink';

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export type ChipTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted';

export const CHIP: Record<ChipTone, string> = {
  neutral: 'border-admin-line bg-admin-canvas text-admin-ink',
  brand: 'border-himalayan/25 bg-himalayan-lighter text-himalayan-dark',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  muted: 'border-admin-line bg-admin-canvas text-admin-muted',
};

export const CHIP_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';

/* ------------------------------------------------------------------ */
/* Navigation rail                                                     */
/* ------------------------------------------------------------------ */

export const RAIL_WIDTH = 'w-[264px]';

export const RAIL_LINK_BASE =
  'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors';

export const RAIL_LINK_ACTIVE =
  'bg-white/10 text-white shadow-[inset_2px_0_0_0_var(--color-himalayan)]';

export const RAIL_LINK_IDLE =
  'text-admin-rail-text hover:bg-admin-rail-hover hover:text-white';

/** Gradient icon tile — the rail's and stat tiles' signature shape. */
export const ICON_TILE =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br';

export const ICON_TILE_TONES = {
  brand: 'from-[#B86452] to-[#8D4133] text-white',
  slate: 'from-[#453d36] to-[#2d2722] text-white',
  green: 'from-[#3F6550] to-[#2a4435] text-white',
  amber: 'from-[#C98745] to-[#9e632b] text-white',
  violet: 'from-[#8D4133] to-[#26211C] text-white',
  sky: 'from-[#3F6550] to-[#C98745] text-white',
} as const;

export type IconTone = keyof typeof ICON_TILE_TONES;
