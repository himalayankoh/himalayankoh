import { permanentRedirect } from 'next/navigation';

/**
 * The standalone Quality page was folded into About Us.
 *
 * The copy was not deleted — it now lives on `/about` — and this route is a
 * **permanent** redirect so anything that already links to or indexes `/quality`
 * (a bookmark, an external link, a search result) lands on the content's new home
 * instead of a 404. The route is deliberately kept as a redirect rather than removed
 * outright: a deleted route returns 404, which loses the ranking signal.
 *
 * No metadata is exported here: the destination's own metadata is what should be
 * indexed, and a redirect response carries no body to describe.
 */
export default function Page() {
  permanentRedirect('/about');
}
