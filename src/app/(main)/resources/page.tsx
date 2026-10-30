import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import ResourcesClient from './ResourcesClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Resource Center - Salt Science & Pasture Guides | Himalayan Koh',
    description:
      'Educational articles on livestock salt requirements, equine hydration, cooking on salt slabs, bulk storage protocols, and trace mineral chemistry.',
    path: '/resources',
  });
}

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Resources', path: '/resources' },
        ])}
      />
      <ResourcesClient />
    </>
  );
}
