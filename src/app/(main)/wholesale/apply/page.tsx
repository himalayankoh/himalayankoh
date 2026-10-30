import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import WholesaleApplyPage from '@/views/wholesale/WholesaleApplyPage';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Apply for a Wholesale Account | Himalayan Koh',
    description:
      'Apply for a Himalayan Koh wholesale account: tell us about your business, the products you buy and the volumes you move. Applications are reviewed by hand.',
    path: '/wholesale/apply',
  });
}

export default function Page() {
  return <WholesaleApplyPage />;
}
