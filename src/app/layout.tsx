import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';
import { siteOrigin } from '@/lib/seo/server';
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonLd';
import JsonLd from '@/components/seo/JsonLd';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  GOOGLE_SITE_VERIFICATION,
  SITE_NAME,
} from '@/lib/seo/constants';

const origin = siteOrigin();

export const metadata: Metadata = {
  // Omitted entirely until the owner sets the token — an empty
  // `google-site-verification` tag fails verification in a way that looks like a
  // mistake on the site rather than a missing configuration.
  ...(GOOGLE_SITE_VERIFICATION
    ? { verification: { google: GOOGLE_SITE_VERIFICATION } }
    : {}),
  title: {
    default: DEFAULT_TITLE,
    template: '%s',
  },
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL(origin),
  alternates: { canonical: '/' },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: origin,
    siteName: SITE_NAME,
    type: 'website',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://wp.himalayankoh.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;0,8..60,800;1,8..60,400&display=swap"
          rel="stylesheet"
        />
        {/* Site-level structured data — applies to every route, not just the homepage. */}
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
