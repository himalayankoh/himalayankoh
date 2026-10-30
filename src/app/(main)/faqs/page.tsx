import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import FaqsClient from './FaqsClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Frequently Asked Questions - Himalayan Koh',
    description:
      'Answers about Himalayan Koh returns, refunds, shipping times, payment options, bulk and wholesale orders, and using Himalayan pink salt at home.',
    path: '/faqs',
  });
}

export default function Page() {
  return <FaqsClient />;
}
