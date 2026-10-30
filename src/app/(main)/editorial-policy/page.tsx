import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import EditorialPolicyClient from './EditorialPolicyClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Editorial Policy - Himalayan Koh',
    description:
      'How Himalayan Koh researches, writes and corrects its guides: sources we cite, how AI tools are used, how updates and corrections work, and the commercial interest we state openly.',
    path: '/editorial-policy',
  });
}

export default function Page() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Editorial Policy', path: '/editorial-policy' },
        ])}
      />
      <EditorialPolicyClient />
    </>
  );
}
