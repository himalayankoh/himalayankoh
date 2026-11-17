import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo/metadata';
import VerifyEmailClient from './VerifyEmailClient';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Confirm Your Email - Himalayan Koh',
    description: 'Confirm the email address on your Himalayan Koh account.',
    path: '/verify-email',
    noindex: true,
  });
}

export default function Page() {
  return <VerifyEmailClient />;
}
