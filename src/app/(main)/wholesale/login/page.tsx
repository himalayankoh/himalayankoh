import { Suspense } from 'react';
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import WholesaleLoginPage from '@/views/wholesale/WholesaleLoginPage';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Wholesale Sign-in | Himalayan Koh',
    description: 'Sign in to your Himalayan Koh wholesale account for tier pricing, container planning and quotations.',
    path: '/wholesale/login',
  });
}

/**
 * The sign-in form reads `?next=` to return a buyer to the page they were on, which
 * makes it a dynamic read — so it is wrapped in Suspense rather than being allowed to
 * make the whole page a client-side render.
 */
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm-white" />}>
      <WholesaleLoginPage />
    </Suspense>
  );
}
