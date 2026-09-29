import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '@/lib/seo/constants';
import { localBusinessJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import HomeClient from './HomeClient';

/**
 * The homepage is a shell: `HomeClient` renders it, and nothing on the server
 * reads commerce data for it, so a five-minute edge window costs no freshness
 * that anyone can observe. Without a window the page is treated as uncacheable
 * (`no-store`) and every visit renders on the Worker.
 */
export const revalidate = 300;

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
  });
}

export default function Page() {
  return (
    <>
      <JsonLd data={localBusinessJsonLd()} />
      <HomeClient />
    </>
  );
}
