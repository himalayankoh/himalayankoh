import type { NextConfig } from 'next';
import { LEGACY_REDIRECTS } from './src/lib/seo/legacyRedirects';
import { PRODUCTION_HOSTS } from './src/lib/seo/indexing';
import { LEGACY_ACCOUNT_REDIRECTS } from './src/lib/auth/roleRouting';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Legacy Vite page components live in src/views (not src/pages — reserved by Next.js).
  pageExtensions: ['tsx', 'ts'],
  async redirects() {
    return [
      // NOTE: /admin/settings deliberately has NO redirect here. It used to send
      // the admin back to the dashboard because no settings screen existed; the
      // console now has one (src/views/admin/AdminSettings.tsx, also served at
      // /admin/api-keys), so the rail entry resolves instead of silently
      // bouncing to the dashboard.
      // The separate shipping-ready form is gone — Add Product on the products
      // page opens the full editor, which does everything that page did and
      // more. Kept as a redirect so an existing bookmark lands somewhere useful
      // instead of on a 404.
      {
        source: '/admin/new-shipping-product',
        destination: '/admin/products',
        permanent: false,
      },
      {
        source: '/admin/blogs',
        destination: '/admin/blog',
        permanent: false,
      },
      {
        source: '/admin/cj-setup',
        destination: '/admin/suppliers',
        permanent: false,
      },
      {
        source: '/admin/settings/listing-playbook',
        destination: '/admin/listing-playbook',
        permanent: false,
      },
      // Both pouch products were renamed to fix a typo ("Eidible" ->
      // "Edible") and correct their weight labeling — old slugs redirect so
      // existing links/bookmarks/search rankings aren't lost.
      {
        source: '/products/himalayan-pink-eidible-salt-fine-grain-pouche',
        destination: '/products/himalayan-pink-edible-salt-fine-grain-pouch-3-lb',
        permanent: true,
      },
      {
        source: '/products/himalayan-pink-eidible-salt-fine-grain-pouche-',
        destination: '/products/himalayan-pink-edible-salt-fine-grain-pouch-6-lb',
        permanent: true,
      },
      // The standalone Quality page was folded into About Us. The route is gone, so
      // this permanent redirect keeps anything that already links to or indexes
      // `/quality` resolving onto the content's new home instead of a 404.
      //
      // This is a router-level redirect on purpose: `next/navigation`'s
      // `permanentRedirect()` throws on this Worker runtime (see the `/return` page),
      // so the redirect has to happen before any page renders.
      {
        source: '/quality',
        destination: '/about',
        permanent: true,
      },
      // The account area is one page (`/account`, opening on My Orders); the
      // routes that used to be separate screens resolve to it here, at the
      // router, before any page renders. Listed ahead of the WordPress rules so
      // an account path can never be captured by a legacy content redirect.
      ...LEGACY_ACCOUNT_REDIRECTS.map(({ source, destination }) => ({
        source,
        destination,
        permanent: false,
      })),
      // Legacy WordPress URLs last, so the admin rules above always win.
      ...LEGACY_REDIRECTS,
    ];
  },
  async headers() {
    return [
      {
        source: '/images/products/white-background/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Rehosted WordPress images (see src/lib/images/legacyAssets.ts). These
      // are frozen assets — a replacement gets a new filename, never a new body
      // under the same name — so they are safe to cache indefinitely.
      {
        source: '/images/legacy/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Non-production hosts serve this same build — the preview subdomain,
      // temporary verification aliases, and now every Cloudflare Workers
      // deployment — and none of them may be indexed. No host information
      // exists at build time to branch on in generateMetadata, and adding it
      // there would opt all 38 prerendered routes into dynamic rendering; a
      // host-scoped response header keeps the storefront prerendered while
      // making the deployment host unindexable. Headers are matched before the
      // filesystem, so this covers prerendered HTML, /robots.txt and public
      // files alike.
      //
      // Stated as "every host except production" rather than a list of
      // previews, so a deployment that exists for one afternoon cannot be
      // forgotten here — see `src/lib/seo/indexing.ts` for why the list is
      // inverted, and its tests for the hosts this must never catch.
      //
      // Two sources, not one: `/:path*` does not cover the root itself under
      // vinext — measured on the built Worker, `/` answered 200 with no
      // `X-Robots-Tag` while `/about` and `/privacy` carried it — and the root
      // is the single most important page to keep out of the index on a
      // temporary host.
      ...['/', '/:path*'].map((source) => ({
        source,
        missing: PRODUCTION_HOSTS.map((value) => ({
          type: 'host' as const,
          value,
        })),
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
    ];
  },
  images: {
    // Only hosts this storefront actually serves images from. `**.vercel.app` was
    // here so the Vercel-era deployment could optimise its own assets; nothing has
    // referenced it since the content moved to WooCommerce and the legacy images
    // became self-hosted, and a wildcard over a shared domain is an image proxy for
    // anyone who can get a URL into the page. Re-add it only with a reason.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'himalayankoh.com' },
      { protocol: 'https', hostname: '**.himalayankoh.com' },
    ],
  },
};

export default nextConfig;
