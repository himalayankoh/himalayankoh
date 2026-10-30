import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import GalleryClient from './GalleryClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Gallery - Himalayan Pink Salt Products | Himalayan Koh',
    description:
      'Photos of Himalayan Koh pink salt: fine and coarse edible grades, bulk rock salt bags, and salt in the kitchen.',
    path: '/gallery',
  });
}

export default function Page() {
  return <GalleryClient />;
}
