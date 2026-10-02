import Link from 'next/link';
import {
  BookOpen,
  FolderTree,
  Home,
  Package,
  Shield,
  Users,
} from 'lucide-react';
import { RESOURCE_ARTICLES } from '@/data/resources';
import { getAllAuthors } from '@/data/authors';

interface SitemapProduct {
  name: string;
  slug: string;
  category?: string;
}

interface SitemapPageProps {
  products?: SitemapProduct[];
}

const STATIC_PAGES = [
  { name: 'Home', href: '/' },
  { name: 'About Himalayan Koh', href: '/about' },
  { name: 'Quality, Sourcing & Verification Standards', href: '/quality' },
  { name: 'Resource Center & Guides', href: '/resources' },
  { name: 'All Products Shop', href: '/products' },
  { name: 'Visual Gallery', href: '/gallery' },
  { name: 'Frequently Asked Questions (FAQs)', href: '/faqs' },
  { name: 'Contact & Warehouse Support', href: '/contact' },
];

const POLICY_PAGES = [
  { name: 'Product, Veterinary & Health Disclaimer', href: '/disclaimer' },
  { name: 'Privacy Policy & Google AdSense Disclosures', href: '/privacy' },
  { name: 'Terms of Service', href: '/terms' },
  { name: 'Shipping & Delivery Policy', href: '/shipping' },
  { name: 'Return Policy & RMA Instructions', href: '/returns' },
  { name: 'Google ads.txt Verification Record', href: '/ads.txt' },
  { name: 'Machine-Readable XML Sitemap', href: '/sitemap.xml' },
];

const CATEGORIES = [
  { name: 'Edible Pink Salt', href: '/products?category=edible-pink-salt' },
  { name: 'Salt Licks', href: '/products?category=licks-blocks' },
  { name: 'Bulk and Rock Salt', href: '/products?category=bulk' },
];

const DEFAULT_PRODUCTS: SitemapProduct[] = [
  { name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)', slug: 'himalayan-rock-salt-45-lbs-large-chunks' },
  { name: 'Himalayan Salt Fine & Coarse Grain — 6 lbs', slug: 'himalayan-salt-6-lbs' },
  { name: 'Himalayan Salt Fine Grain — 3 lbs', slug: 'himalayan-salt-fine-grain-3-lbs' },
  { name: 'Himalayan Salt Lick — 12 to 14 lbs', slug: 'himalayan-salt-lick-12-to-14-lbs' },
  { name: 'Himalayan Salt Lick — 5 to 6 lbs', slug: 'himalayan-salt-lick-5-to-6-lbs' },
  { name: 'Himalayan Salt Lick — 1 to 2 lbs', slug: 'himalayan-salt-lick-1-to-2-lbs' },
  { name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 6 lbs', slug: 'himalayan-pink-edible-salt-fine-grain-pouch-6-lbs' },
  { name: 'Himalayan Pink Edible Salt Fine Grain Pouch — 3 lbs', slug: 'himalayan-pink-edible-salt-fine-grain-pouch-3-lbs' },
  { name: 'Himalayan Pink Edible Salt Fine & Coarse Grain — 16 oz Jar', slug: 'himalayan-pink-edible-salt-16-oz-jar' },
];

export default function SitemapPage({ products = DEFAULT_PRODUCTS }: SitemapPageProps) {
  const authors = getAllAuthors();

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <span className="inline-block px-3 py-1 bg-himalayan/20 text-himalayan text-xs font-semibold tracking-wider uppercase rounded-full mb-3">
            Navigation Index
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold mb-3">
            Sitemap
          </h1>
          <p className="text-white/80 text-base max-w-2xl mx-auto">
            A complete index of all public catalog products, educational guides, policy disclosures, and commercial hubs.
          </p>
        </div>
      </div>

      {/* Main Directory Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          {/* Main Pages */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <Home className="w-5 h-5 text-himalayan" /> Core Website Pages
            </h2>
            <ul className="space-y-2.5 text-sm">
              {STATIC_PAGES.map((page) => (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-himalayan/60">•</span>
                    <span>{page.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal & Policies */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <Shield className="w-5 h-5 text-himalayan" /> Policies & Disclosures
            </h2>
            <ul className="space-y-2.5 text-sm">
              {POLICY_PAGES.map((policy) => (
                <li key={policy.href}>
                  <Link
                    href={policy.href}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-himalayan/60">•</span>
                    <span>{policy.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Catalog Categories */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-himalayan" /> Catalog Shelves
            </h2>
            <ul className="space-y-2.5 text-sm">
              {CATEGORIES.map((cat) => (
                <li key={cat.href}>
                  <Link
                    href={cat.href}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-himalayan/60">•</span>
                    <span>{cat.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Educational Articles */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4 md:col-span-2 lg:col-span-2">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-himalayan" /> Resource Center & Research Library ({RESOURCE_ARTICLES.length} Guides)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              {RESOURCE_ARTICLES.map((art) => (
                <div key={art.slug}>
                  <Link
                    href={`/resources/${art.slug}`}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-start gap-1.5"
                  >
                    <span className="text-himalayan/60 mt-1">•</span>
                    <span className="leading-snug">{art.title}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Authors */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <Users className="w-5 h-5 text-himalayan" /> Authors & Editorial Board
            </h2>
            <ul className="space-y-2.5 text-sm">
              {authors.map((auth) => (
                <li key={auth.slug}>
                  <Link
                    href={`/author/${auth.slug}`}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-center gap-1.5"
                  >
                    <span className="text-himalayan/60">•</span>
                    <span>{auth.name} ({auth.role})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Published Products */}
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4 md:col-span-2 lg:col-span-3">
            <h2 className="font-serif text-xl font-bold text-charcoal flex items-center gap-2">
              <Package className="w-5 h-5 text-himalayan" /> Verified Catalog Products ({products.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 text-sm">
              {products.map((prod) => (
                <div key={prod.slug}>
                  <Link
                    href={`/products/${prod.slug}`}
                    className="text-charcoal-light hover:text-himalayan transition-colors flex items-start gap-1.5"
                  >
                    <span className="text-himalayan/60 mt-1">•</span>
                    <span className="leading-snug">{prod.name}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
