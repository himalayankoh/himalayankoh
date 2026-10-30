import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import ReturnClient from './ReturnClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Returns & Refunds Policy - Himalayan Koh',
    description: 'Return and replacement policy for Himalayan Koh products. Learn about our 30-day return window, refund procedures, and return authorization.',
    path: '/returns',
  });
}

export default function Page() {
  return <ReturnClient />;
}
