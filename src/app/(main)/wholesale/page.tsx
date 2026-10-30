import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import WholesaleLandingPage from '@/views/wholesale/WholesaleLandingPage';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Wholesale Himalayan Pink Salt — Pallets & Containers | Himalayan Koh',
    description:
      'Buy Himalayan pink salt by the pallet, part load or full container. Mixed loads, volume price breaks, quoted EXW, FOB, CFR or CIF. Apply for a wholesale account.',
    path: '/wholesale',
  });
}

export default function Page() {
  return <WholesaleLandingPage />;
}
