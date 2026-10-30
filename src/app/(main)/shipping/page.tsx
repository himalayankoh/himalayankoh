import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import ShippingClient from './ShippingClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Shipping & Delivery - Himalayan Koh',
    description:
      'Himalayan Koh shipping and delivery: dispatch in 1–2 business days from our Houston TX warehouse, USPS and FedEx carriers, expedited options and order tracking.',
    path: '/shipping',
  });
}

export default function Page() {
  return <ShippingClient />;
}
