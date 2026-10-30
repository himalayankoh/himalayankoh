import type { Metadata } from 'next';
import WholesalePortalPage from '@/views/wholesale/WholesalePortalPage';

/**
 * The portal is account-scoped, so it is kept out of search results: an indexed
 * portal URL that redirects to a sign-in page is noise, and a cached one would be a
 * mistake.
 */
export const metadata: Metadata = {
  title: 'Wholesale Portal | Himalayan Koh',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <WholesalePortalPage initialTab="dashboard" />;
}
