import type { Metadata } from 'next';
import WholesalePortalPage from '@/views/wholesale/WholesalePortalPage';

export const metadata: Metadata = {
  title: 'My Quotations | Himalayan Koh',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <WholesalePortalPage initialTab="quotes" />;
}
