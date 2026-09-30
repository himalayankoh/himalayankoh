/**
 * Responsive delivery for the store's own product photos.
 *
 * The storefront used to hand every product image to the browser at full size:
 * the gallery image, the card image and the homepage featuring all pointed at the
 * single `src` WooCommerce reports. On staging that meant a 482 kB PNG drawn into
 * a ~300 px card.
 *
 * WooCommerce already knows better. Its Store API and REST v3 image objects carry
 * the WordPress-generated `srcset`, which lists the real intermediate sizes with
 * their **real** width descriptors — measured on staging (2026-09-30), the PNG
 * above is published as `573w, 500w, 370w, 360w, 300w, 180w, 150w, 100w`, and
 * every one of those URLs answers 200. So there is no need to invent sizes from a
 * naming convention: we can use the store's own numbers.
 *
 * ## What is kept
 *
 * Only the WordPress **size token** (`300x300`) is carried, not the candidate
 * URL. The catalogue travels to the browser on every client-side navigation, and
 * a full `srcset` per image measured about 620 bytes on staging against a
 * ~1 kB product payload — a 3× increase to buy bytes back. A token list is about
 * 45 bytes.
 *
 * That is only safe because a token is kept *after proving* the store published
 * exactly `name-<token>.ext` for it (see {@link parseStoreSrcset}). A candidate
 * whose URL is not the original plus a size suffix — a WordPress `-scaled` or
 * editor-cropped variant, for instance — is not kept, so the browser can never
 * be sent to a URL the store did not confirm.
 *
 * ## What is deliberately NOT done
 *
 * 1. **The original is never dropped.** It is always re-added as the largest
 *    candidate, carrying the width the store reported for it. Without it, a slot
 *    wider than every remaining candidate makes the browser fall back to the
 *    largest candidate and *upscale* it — the one way this change could visibly
 *    damage quality. With it, a slot that needs more than the smaller candidates
 *    can offer simply gets today's full-size image.
 * 2. **No candidate close to the original's width is offered.** WordPress
 *    republishes near-original sizes as *larger* files than the original they came
 *    from — measured: the 36 kB WebP original is republished as a 66 kB 500 px
 *    variant, a 44 kB 370 px one and a 42 kB 360 px one, and the 482 kB PNG as a
 *    399 kB 500 px one. Offering those would let the browser choose something
 *    bigger than the file it would otherwise have used. Only candidates at or
 *    below {@link MAX_CANDIDATE_RATIO} of the original's width are kept, which for
 *    every image measured here is strictly smaller in bytes than the original.
 *
 * The result is a strict improvement: the browser either finds a genuinely
 * smaller file that still covers the slot, or it uses the original exactly as it
 * does today.
 */

/** A store-reported original width and the smaller size tokens worth offering. */
export interface ResponsiveImageSource {
  /** Intrinsic width of the image's own `src`, as the store reports it. */
  width: number;
  /** WordPress size tokens below the ratio, e.g. `["150x150","300x300"]`. */
  tokens: string[];
}

/** Product images carry a `source` keyed by their own URL. */
export type ResponsiveImageSources = Record<string, ResponsiveImageSource>;

/**
 * Candidates wider than this fraction of the original are not offered.
 *
 * The bound is where a candidate is guaranteed to be a smaller *file*, not just a
 * smaller picture. A candidate at `f` of the original's width has `f²` of its
 * pixels, so it comes out smaller as long as WordPress's re-encode is no more than
 * `1/f²` times as expensive per pixel as the original. Measured on staging
 * (2026-09-30), WordPress's re-encodes of an image the admin editor had already
 * optimized to WebP ran about 3× the bytes per pixel of the original — so the
 * threshold has to sit below `1/√3 ≈ 0.58` to stay a real saving, not above it.
 *
 * 0.55 keeps that margin (a candidate may be up to ~3.3× less efficient and still
 * be smaller) and still leaves the useful ladder: for the 573 px original this
 * store publishes, 300w and below.
 */
export const MAX_CANDIDATE_RATIO = 0.55;

/**
 * The gallery column on a product page: full width until the two-column layout
 * starts at `md`, half of it after. Deliberately generous — over-stating the slot
 * makes the browser choose a larger candidate, which costs bytes but never
 * sharpness.
 */
export const GALLERY_IMAGE_SIZES = '(min-width: 768px) 50vw, 100vw';

/**
 * A product card, across the two grids that render one.
 *
 * `/products` is `1 / 2 / 3 / 4` columns at `<360 / ≥360 / ≥768 / ≥1280`, and the
 * homepage featuring is `1 / 2 / 4` at `<360 / ≥360 / ≥1024`, inside a `max-w-7xl`
 * container. One `sizes` cannot be exact for both, so this states the wider of the
 * two at each breakpoint.
 */
export const CARD_IMAGE_SIZES =
  '(min-width: 1280px) 320px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 360px) 50vw, 100vw';

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|avif)$/i;
const SIZE_TOKEN = /^\d+x\d+$/;
/** A filename that already ends in a WordPress size suffix. */
const ALREADY_SIZED = /-\d+x\d+$/;

const CANDIDATE_PATTERN = /^(.*\S)\s+(\d+)w$/;

interface UrlParts {
  base: string;
  extension: string;
}

/**
 * Split `…/name.png` into `…/name` and `.png`, or `null` when the URL is not a
 * plain, unsized image path.
 *
 * A URL that already carries a size suffix is rejected rather than extended: it
 * means the store's own record points at an intermediate, and appending another
 * `-300x300` would name a file that does not exist.
 */
function splitImageUrl(src: string): UrlParts | null {
  const match = IMAGE_EXTENSION.exec(src);
  if (!match) return null;
  const extension = match[0];
  const base = src.slice(0, src.length - extension.length);
  if (!base.includes('/') || ALREADY_SIZED.test(base)) return null;
  return { base, extension };
}

/** The URL a size token names for this image, or `null` when it cannot be named. */
function urlForToken(src: string, token: string): string | null {
  const parts = splitImageUrl(src);
  if (!parts || !SIZE_TOKEN.test(token)) return null;
  return `${parts.base}-${token}${parts.extension}`;
}

/** The token a candidate URL names, or `null` when it is not a plain size suffix. */
function tokenForUrl(parts: UrlParts, candidateUrl: string): string | null {
  const prefix = `${parts.base}-`;
  if (!candidateUrl.startsWith(prefix) || !candidateUrl.endsWith(parts.extension)) return null;
  const token = candidateUrl.slice(prefix.length, candidateUrl.length - parts.extension.length);
  return SIZE_TOKEN.test(token) ? token : null;
}

const tokenWidth = (token: string): number => Number.parseInt(token, 10);

/** One candidate the store published for an image. */
export interface CandidateImage {
  url: string;
  width: number;
}

/**
 * The responsive data worth keeping for one image, from candidates the store
 * published, or `null` when nothing can be safely offered.
 *
 * Both the Store API's `srcset` and WordPress's attachment sizes arrive here, so
 * the pruning rule and the URL-verification rule are stated once.
 */
export function buildResponsiveSource(
  originalSrc: string | undefined | null,
  originalWidth: number | undefined | null,
  candidates: CandidateImage[]
): ResponsiveImageSource | null {
  if (!originalSrc) return null;
  if (typeof originalWidth !== 'number' || !Number.isFinite(originalWidth) || originalWidth <= 0) {
    return null;
  }

  const parts = splitImageUrl(originalSrc);
  if (!parts) return null;

  const tokens = candidates
    .filter(
      (candidate) =>
        candidate.url !== originalSrc && candidate.width <= originalWidth * MAX_CANDIDATE_RATIO
    )
    .map((candidate) => tokenForUrl(parts, candidate.url))
    .filter((token): token is string => token !== null);

  if (tokens.length === 0) return null;

  return {
    width: originalWidth,
    tokens: Array.from(new Set(tokens)).sort((a, b) => tokenWidth(a) - tokenWidth(b)),
  };
}

/**
 * Split a WordPress `srcset` into candidates.
 *
 * Splitting on `,` alone would break on a URL that contains one, so the split only
 * happens at a comma followed by something URL-shaped.
 */
function splitCandidates(srcset: string): Array<{ url: string; width: number }> {
  return srcset
    .split(/,\s*(?=https?:\/\/|\/)/)
    .map((entry) => entry.trim())
    .map((entry) => {
      const match = CANDIDATE_PATTERN.exec(entry);
      if (!match) return null;
      const width = Number(match[2]);
      if (!Number.isFinite(width) || width <= 0) return null;
      return { url: match[1].trim(), width };
    })
    .filter((candidate): candidate is { url: string; width: number } => candidate !== null);
}

/**
 * The responsive data worth keeping for one store image, or `null` when there is
 * nothing safe to add.
 *
 * Returns `null` unless the store's `srcset` names the image's own `src` with a
 * width — that entry is the proof of how wide the original is, and without it
 * every later decision would be a guess.
 */
export function parseStoreSrcset(
  srcset: string | undefined | null,
  originalSrc: string | undefined | null
): ResponsiveImageSource | null {
  if (!srcset || !originalSrc) return null;

  const candidates = splitCandidates(srcset);
  // The entry naming the image's own `src` is the proof of how wide the original
  // is; without it every later decision would be a guess.
  const original = candidates.find((candidate) => candidate.url === originalSrc);
  if (!original) return null;

  return buildResponsiveSource(originalSrc, original.width, candidates);
}

export interface ResponsiveImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * `src`/`srcSet`/`sizes` for one image, falling back to plain `src` whenever the
 * store did not give us anything safe to add.
 *
 * The original is appended as the largest candidate, so a slot that outgrows the
 * smaller ones uses it rather than upscaling a small variant.
 */
export function responsiveImageProps(
  src: string | undefined | null,
  sources: ResponsiveImageSources | undefined,
  sizes: string
): ResponsiveImageProps {
  if (!src) return { src: '' };

  const source = sources?.[src];
  if (!source) return { src };

  const candidates = source.tokens
    .map((token) => {
      const url = urlForToken(src, token);
      return url ? `${url} ${tokenWidth(token)}w` : null;
    })
    .filter((candidate): candidate is string => candidate !== null);

  if (candidates.length === 0) return { src };

  return {
    src,
    srcSet: `${candidates.join(', ')}, ${src} ${source.width}w`,
    sizes,
  };
}

/**
 * Undo `srcSet` in place after a candidate failed to load, so the browser falls
 * back to the original instead of the element's placeholder.
 *
 * A candidate is only published after the store named it, but nothing guarantees
 * the file is still on disk — and a 404 candidate is an invisible failure that a
 * responsive image must not have. Called from an `onError` handler; a second
 * failure (the original itself) is left to the caller.
 */
export function dropResponsiveCandidates(image: HTMLImageElement): boolean {
  if (!image.srcset) return false;
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  return true;
}
