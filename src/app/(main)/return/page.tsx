import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import ReturnClient from '../returns/ReturnClient';

/**
 * The canonical route is `/returns` (plural). This page exists only so bookmarks
 * and cached links to `/return` (singular) still land on the policy.
 *
 * It used to call `redirect('/returns')`, which is the right thing to do — and it
 * works on a Node server, but on this Worker runtime `next/navigation`'s
 * `redirect()` throws instead of emitting a 308, so `/return` answered **500** and
 * every "return policy" link (contact page, footer, product pages, the sitemap)
 * was a dead click.
 *
 * Rather than depend on a redirect primitive that does not work here, the legacy
 * URL now renders the same policy. `canonical` points at `/returns` and the page
 * is `noindex`, which is what the redirect was there to achieve: one indexable
 * URL, and no lost visitor.
 */
export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Returns & Refunds Policy - Himalayan Koh',
    description:
      'Return and replacement policy for Himalayan Koh products. Learn about our 30-day return window, refund procedures, and return authorization.',
    path: '/returns',
    noindex: true,
  });
}

export default function Page() {
  return <ReturnClient />;
}
