/**
 * A resource's published month, as written — e.g. "March 2026".
 *
 * This label renders on a server-prerendered page and again during hydration, so
 * it must produce the exact same string in both places or React throws the server
 * tree away: `Minified React error #418`, the hydration text mismatch a full load
 * of `/products?category=edible-pink-salt` logged on the deployed preview
 * (2026-10-01).
 *
 * The cause was the runtime timezone. `toLocaleDateString` reads it by default,
 * and a date-only string — `'2026-03-01'`, which JS parses as *UTC* midnight —
 * falls on the previous day in every timezone west of Greenwich. Cloudflare
 * Workers run in UTC and printed "March 2026"; a US browser printed "February
 * 2026" for the same sheet. Only a shelf whose sheet sits on the 1st of a month
 * disagreed, which is why exactly `/products?category=edible-pink-salt` (its
 * `2026-03-01` grain-size guide) tripped #418 while shelves dated the 5th or
 * later were clean.
 *
 * Pinning the format to UTC makes the label the calendar date that was authored,
 * on every runtime. Do not remove `timeZone: 'UTC'` — without it this becomes a
 * server/client hydration mismatch again on any first-of-month date.
 */
export function formatPublishedMonthYear(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
