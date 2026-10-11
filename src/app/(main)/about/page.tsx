import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import AboutClient from './AboutClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'About Himalayan Koh — Unrefined Himalayan Pink Salt',
    // Names only the ranges the catalogue actually carries. The previous version
    // advertised "lamps", which the storefront does not sell, so the description
    // promised a product line a shopper could not find.
    description:
      'Himalayan Koh packs unrefined Himalayan pink salt: fine and coarse edible grades, salt licks for horses and cattle, and 45 lb livestock bags — shipped from Houston, Texas.',
    path: '/about',
  });
}

export default function Page() {
  return <AboutClient />;
}
