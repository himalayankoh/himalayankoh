import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppProvider, useApp, type Product } from '../App';
import { ASEOEngine } from './AdminSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/seo-engine',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../services/wordpressAdminAuth', () => ({
  getAccessToken: vi.fn(() => 'mock-token'),
}));

const mockProducts: Product[] = [
  {
    id: '2487',
    name: 'Himalayan Salt Lick 5-6 lbs',
    shortDesc: 'Natural rock salt lick for horses and livestock.',
    description: 'Pure mineral salt block from Pakistan.',
    price: 24.99,
    originalPrice: 29.99,
    category: 'Animal Mineral Licks',
    stock: 50,
    images: ['https://example.com/lick.jpg'],
    imageAlts: ['Himalayan Salt Lick 5-6 lbs'],
    rating: 5,
    reviews: 12,
    isActive: true,
    brand: 'Himalayan Koh',
    condition: 'New',
    tags: ['salt'],
    weight: '5.5 lbs',
    dimensions: '6x4x4',
    origin: 'Pakistan',
    freeShipping: true,
    shippingCost: '0',
    variants: [],
    slug: 'himalayan-salt-lick-5-6-lbs',
    seoTitle: 'Himalayan Salt Lick 5-6 lbs | Himalayan Koh',
    seoDescription: 'Natural rock salt lick for horses and livestock.',
    seoKeywords: ['salt lick', 'himalayan salt'],
  },
  {
    id: '2490',
    name: 'Himalayan Pink Salt Cooking Block',
    shortDesc: 'Cooking block for grilling and serving.',
    description: 'Authentic pink salt cooking tile.',
    price: 34.50,
    originalPrice: 39.99,
    category: 'Salt Blocks',
    stock: 25,
    images: ['https://example.com/block.jpg'],
    imageAlts: ['Cooking Block'],
    rating: 5,
    reviews: 8,
    isActive: true,
    brand: 'Himalayan Koh',
    condition: 'New',
    tags: ['cooking'],
    weight: '10 lbs',
    dimensions: '8x8x2',
    origin: 'Pakistan',
    freeShipping: true,
    shippingCost: '0',
    variants: [],
    slug: 'himalayan-pink-salt-cooking-block',
  },
];

vi.mock('../lib/admin/loadAppProducts', () => ({
  loadAppProducts: vi.fn(async () => mockProducts),
  getCachedAppProducts: vi.fn(() => []),
  setCachedAppProducts: vi.fn(),
  clearAppProductsCache: vi.fn(),
}));

describe('ASEOEngine Product Dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing and contains the product select dropdown and controls', () => {
    const html = renderToStaticMarkup(
      <AppProvider>
        <ASEOEngine />
      </AppProvider>
    );

    expect(html).toContain('Enterprise SEO &amp; Content Engine');
    expect(html).toContain('-- Select a product --');
    expect(html).toContain('AI Tone');
    expect(html).toContain('Product SEO Fields');
  });

  it('renders options for all hydrated products with name and price', () => {
    // Render with products pre-populated in context
    const html = renderToStaticMarkup(
      <AppProvider initialProducts={mockProducts}>
        <ASEOEngine />
      </AppProvider>
    );

    expect(html).toContain('value="2487"');
    expect(html).toContain('Himalayan Salt Lick 5-6 lbs · $24.99');
    expect(html).toContain('value="2490"');
    expect(html).toContain('Himalayan Pink Salt Cooking Block · $34.50');
  });
});
