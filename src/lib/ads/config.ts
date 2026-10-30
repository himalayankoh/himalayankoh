/**
 * AdSense integration seam — **disabled**, deliberately.
 *
 * The owner has an AdSense account and a publisher ID, and `himalayankoh.com` is
 * `Requires review` there. None of that is a reason to render ads yet:
 *
 * - The staging build must not carry the AdSense script at all.
 * - Nothing may load ads on a host that is not production, or the review would be
 *   looking at a staging page.
 * - A disabled integration must not leave blank ad slots behind, because an empty
 *   reserved box is a layout hole and a shift when it finally fills.
 *
 * So activation is three deliberate steps, none of which need a redesign:
 *
 * 1. Set `NEXT_PUBLIC_ADSENSE_ENABLED=true` and `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…`
 *    on the **production** deployment only.
 * 2. Place `<AdSlot slot="…" />` where an ad belongs.
 * 3. Submit the production site for review.
 *
 * Until step 1 the flag defaults to off, and even with the flag on the client ID
 * must look like a publisher ID and the request must be on a production host, so a
 * staging deployment of the same commit still renders nothing. The publisher ID
 * lives in one environment variable — it is never hard-coded per page.
 */

import { isProductionHost } from '@/lib/seo/indexing';

/** `ca-pub-` followed by digits, the only shape AdSense issues. */
const PUBLISHER_ID_PATTERN = /^ca-pub-\d{10,}$/;

/** The publisher ID, or `''` when the owner has not supplied one. */
export const ADSENSE_CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '').trim();

/** The explicit opt-in flag. Absent, empty or `false` all mean off. */
export const ADSENSE_FLAG_ENABLED = process.env.NEXT_PUBLIC_ADSENSE_ENABLED === 'true';

/** True when the client ID is present and shaped like a real publisher ID. */
export function hasValidPublisherId(client = ADSENSE_CLIENT): boolean {
  return PUBLISHER_ID_PATTERN.test(client);
}

/**
 * Whether ads may render on this host.
 *
 * Takes the host explicitly rather than reading a global because the two halves of
 * the decision come from different places — the flag from the build, the host from
 * the request — and the host is the half that keeps a staging request from serving
 * the script if the flag is ever set on the wrong deployment.
 */
export function adsenseEnabledForHost(
  host: string | null | undefined,
  options: { flagEnabled?: boolean; client?: string } = {}
): boolean {
  const flagEnabled = options.flagEnabled ?? ADSENSE_FLAG_ENABLED;
  const client = options.client ?? ADSENSE_CLIENT;
  if (!flagEnabled) return false;
  if (!hasValidPublisherId(client)) return false;
  return isProductionHost(host);
}

/**
 * The script URL, or `null` when ads are off for this host.
 *
 * Returning `null` rather than an empty string is the point: the caller renders
 * nothing at all, instead of an ad container with no payload.
 */
export function adsenseScriptSrc(
  host: string | null | undefined,
  options: { flagEnabled?: boolean; client?: string } = {}
): string | null {
  if (!adsenseEnabledForHost(host, options)) return null;
  const client = options.client ?? ADSENSE_CLIENT;
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
}

/** `ads.txt` line for the publisher, or `null` while ads are off. */
export function adsTxtEntry(host: string | null | undefined): string | null {
  if (!adsenseEnabledForHost(host)) return null;
  return `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`;
}
