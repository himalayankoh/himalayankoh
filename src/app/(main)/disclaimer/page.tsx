import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import DisclaimerClient from './DisclaimerClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Website & Product Disclaimer - Himalayan Koh',
    description:
      'Disclaimer for Himalayan Koh: informational content, animal nutrition notes, dietary notices, natural mineral variation, and advertising transparency.',
    path: '/disclaimer',
  });
}

export default function Page() {
  return <DisclaimerClient />;
}
