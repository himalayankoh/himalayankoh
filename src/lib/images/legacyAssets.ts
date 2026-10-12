/**
 * Images that used to be served from the WordPress site at
 * himalayankoh.com/wp-content/uploads/. They are now committed to this repo
 * under public/images/legacy/ and served from our own domain, so the site has
 * no runtime dependency on WordPress and the old host can be shut down.
 *
 * Every reference to these four files goes through this module. To move them
 * somewhere else later (Supabase Storage, a CDN), change the paths here — the
 * rest of the codebase does not name them.
 *
 * The `wordpress` field on each entry is the original source URL. It is not
 * used at runtime; scripts/fetch-legacy-images.mjs reads it to download the
 * files while the old host is still reachable. Once the files are committed,
 * that script's only remaining purpose is documenting where they came from.
 */

/**
 * The pink salt photographs the storefront uses.
 *
 * The registry is deliberately small: an asset record is not harmless, because
 * its `alt` text and file name are what a gallery renders. This is the set the
 * approved public pages actually reference — the homepage hero among them — and
 * nothing is registered "just in case".
 */
export type LegacyImageKey =
  | 'horseLicking'
  | 'bowlOfSalt'
  | 'saltPouch6lb'
  | 'pinkSaltJar16oz'
  | 'saltRockBag';

export interface LegacyImage {
  /** Path served from our own domain, relative to the site root. */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** Original WordPress URL — used only by the fetch script. */
  readonly wordpress: string;
}

const LEGACY_DIR = '/images/legacy';
const WP_BASE = 'https://himalayankoh.com/wp-content/uploads';

export const LEGACY_IMAGES: Record<LegacyImageKey, LegacyImage> = {
  horseLicking: {
    src: `${LEGACY_DIR}/horse-licking-salt.jpg`,
    width: 600,
    height: 450,
    wordpress: `${WP_BASE}/2017/10/slat-licking-horse.jpg`,
  },
  bowlOfSalt: {
    src: `${LEGACY_DIR}/bowl-of-salt.jpg`,
    width: 600,
    height: 450,
    wordpress: `${WP_BASE}/2017/10/bowl-of-salt.jpg`,
  },
  saltPouch6lb: {
    src: `${LEGACY_DIR}/salt-pouch-6lb.webp`,
    width: 500,
    height: 500,
    wordpress: `${WP_BASE}/2025/07/6-lbs-pouche.webp`,
  },
  pinkSaltJar16oz: {
    src: `${LEGACY_DIR}/pink-salt-16oz-jar.jpg`,
    width: 500,
    height: 500,
    wordpress: `${WP_BASE}/2024/08/WhatsApp-Image-2024-08-02-at-11.31.07-PM-500x500.jpeg`,
  },
  saltRockBag: {
    src: `${LEGACY_DIR}/salt-rock-bag.jpg`,
    width: 600,
    height: 450,
    wordpress: `${WP_BASE}/2023/08/S6-600x450.jpg`,
  },
};

/**
 * Shorthand for the common case of only needing the path.
 *
 * These paths resolve even before the image files are committed: migration 026
 * has already pointed the database at them, and next.config.ts carries fallback
 * rewrites that serve each one from WordPress until a real file exists at the
 * path. Run `npm run images:fetch` and commit the results to finish the cutover
 * — the local files then take over automatically.
 */
export const legacyImage = (key: LegacyImageKey): string => LEGACY_IMAGES[key].src;

/** Smaller derivatives of the same authorized photos, with actual pixel widths. */
export function legacyHeroImage(key: 'horseLicking' | 'bowlOfSalt') {
  const name = key === 'horseLicking' ? 'horse-licking-salt' : 'bowl-of-salt';
  const widths = key === 'horseLicking' ? [200, 332] : [200, 400, 549];
  return {
    src: `${LEGACY_DIR}/${name}-${widths.at(-1)}.webp`,
    srcSet: widths.map(width => `${LEGACY_DIR}/${name}-${width}.webp ${width}w`).join(', '),
    sizes: '(min-width: 1024px) 282px, (min-width: 640px) calc((100vw - 64px) / 2), calc((100vw - 44px) / 2)',
    width: key === 'horseLicking' ? 332 : 549,
    height: 332,
  };
}

/**
 * Records that point at a legacy file this repository does not actually have.
 *
 * These paths were referenced by editorial records (a blog post's featured image)
 * and never committed, so they 404 on the site. The honest fix is to correct the
 * record; until then a reader must not be shown a broken image, and guessing a
 * *new* photograph for a post would be inventing content. So each dead path is
 * mapped to the registered asset that is closest in subject, and the substitution
 * is reported to the console rather than performed silently — the owner sees which
 * record still needs fixing.
 */
export const MISSING_LEGACY_IMAGES: Record<string, LegacyImageKey> = {
  '/images/legacy/cattle-grazing.jpg': 'saltRockBag',
  '/images/legacy/horse-salt-lick-paddock.jpg': 'horseLicking',
};

/**
 * A usable path for an image reference, and the missing path it stood in for.
 *
 * `substitutedFrom` is null when the reference was fine, so a caller can render the
 * image either way and warn only when something is actually wrong.
 */
export function resolveLegacyImageSrc(src: string | null | undefined): {
  src: string;
  substitutedFrom: string | null;
} {
  const trimmed = (src ?? '').trim();
  if (!trimmed) return { src: '', substitutedFrom: null };

  const replacement = MISSING_LEGACY_IMAGES[trimmed];
  if (replacement) return { src: LEGACY_IMAGES[replacement].src, substitutedFrom: trimmed };

  return { src: trimmed, substitutedFrom: null };
}
