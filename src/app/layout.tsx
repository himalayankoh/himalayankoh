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
  manifest: '/admin-manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Himalayan Koh Admin',
  },
  icons: {
    apple: '/images/hk_salt_crystal.webp',
    icon: '/logo.svg',
    shortcut: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://wp.himalayankoh.com" />
        <link rel="preload" href="/fonts/source-serif-4/latin-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Site-level structured data — applies to every route, not just the homepage. */}
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        {/* Early APK / Standalone detection script to disable pull-to-refresh overscroll in native app only */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var isApk=(navigator.userAgent&&navigator.userAgent.indexOf('HimalayanKohAdminApp')!==-1)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||('HimalayanKohNative' in window)||(window.navigator&&window.navigator.standalone===true);if(isApk){document.documentElement.classList.add('is-apk-app');if(document.body){document.body.classList.add('is-apk-app');}}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
