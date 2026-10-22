import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import WholesaleVerifyEmailPage from '@/views/wholesale/WholesaleVerifyEmailPage';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Confirm your wholesale email | Himalayan Koh',
    description: 'Confirm the business email address on your Himalayan Koh wholesale application.',
    path: '/wholesale/verify',
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';
  return <WholesaleVerifyEmailPage token={token} />;
}
