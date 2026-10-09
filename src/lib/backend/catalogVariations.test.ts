import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

// Resolved at module load, so they are set before the import below.
vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WOOCOMMERCE_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
});

import { fetchAdminProductBySlug, fetchAdminProducts } from './woocommerce';
import { readCatalogProductBySlug } from './products';

const realFetch = globalThis.fetch;

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub(routes);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  return stub;
}

/** A variable parent, priced only on its variations — how WooCommerce stores them. */
const VARIABLE_PARENT = {
  id: 2492,
  name: 'Himalayan Salt — 6 lbs',
  slug: 'himalayan-salt-6-lbs',
  type: 'variable',
  sku: '',
  price: '',
  regular_price: '',
  stock_status: 'instock',
  featured: true,
  categories: [{ id: 15, name: 'Bulk Salt', slug: 'bulk-salt' }],
  images: [{ src: 'https://cdn.test/6lbs.webp' }],
  variations: [7001, 7002],
  attributes: [
    { id: 2, name: 'Grain Size', visible: true, variation: true, options: ['Fine Grain', 'Coarse Grain'] },
  ],
};

/** The live catalogue's 6 lb pouches: its own slug, and a retirement-map key. */
const LIVE_POUCHES = {
  id: 2321,
  name: 'Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lbs',
  slug: 'pouches',
  type: 'simple',
  sku: '',
  price: '17.95',
  regular_price: '17.95',
  stock_status: 'instock',
  featured: false,
  categories: [{ id: 15, name: 'Uncategorized', slug: 'uncategorized' }],
  images: [{ src: 'https://himalayankoh.test/wp-content/uploads/2023/08/S6.jpg' }],
};

const VARIATIONS = [
  {
    id: 7001,
    regular_price: '19.95',
    sku: 'HK-SFL-F-6lbs',
    stock_status: 'instock',
    attributes: [{ id: 2, name: 'Grain Size', option: 'Fine Grain' }],
  },
  {
    id: 7002,
    sale_price: '17.95',
    regular_price: '19.95',
    sku: 'HK-SFL-C-6lbs',
    stock_status: 'outofstock',
    attributes: [{ id: 2, name: 'Grain Size', option: 'Coarse Grain' }],
  },
];

const SIMPLE_PRODUCT = {
  id: 2484,
  name: 'Himalayan Salt Block — 30 lbs',
  slug: 'himalayan-salt-block-30-lbs',
  type: 'simple',
  price: '49.95',
  regular_price: '49.95',
  sku: 'HK-LB-30LBS',
  stock_status: 'instock',
  categories: [{ id: 14, name: 'Salt Licks & Blocks', slug: 'salt-licks-blocks' }],
  images: [],
};

function routes(products: unknown[], variations: unknown[] = VARIATIONS): WordPressStubRoute[] {
  return [
    { path: '/wc/v3/products', body: products },
    { path: /\/wc\/v3\/products\/\d+\/variations/, body: variations },
  ];
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('the catalog read of a variable product', () => {
  it('reports the store’s real options, addressed the way the cart needs them', async () => {
    useWordPress(routes([VARIABLE_PARENT]));

    const [product] = (await fetchAdminProducts({})) ?? [];

    expect(product.variations?.attributeLabel).toBe('Grain Size');
    expect(product.variations?.options).toEqual([
      {
        id: 7001,
        attribute: 'Grain Size',
        label: 'Fine Grain',
        value: 'Fine Grain',
        price: 19.95,
        sku: 'HK-SFL-F-6lbs',
        inStock: true,
        image: null,
      },
      {
        id: 7002,
        attribute: 'Grain Size',
        label: 'Coarse Grain',
        value: 'Coarse Grain',
        price: 17.95,
        sku: 'HK-SFL-C-6lbs',
        inStock: false,
        image: null,
      },
    ]);
    // The selector's own list comes from the same read, so the caption a shopper
    // picks and the pair the cart is told cannot disagree.
    expect(product.grainSizes).toEqual(['Fine Grain', 'Coarse Grain']);
  });

  it('still derives the price from the variations the parent does not carry', async () => {
    useWordPress(routes([VARIABLE_PARENT]));

    const [product] = (await fetchAdminProducts({})) ?? [];

    expect(product.priceMin).toBe(17.95);
    expect(product.priceMax).toBe(19.95);
  });

  it('derives the range even when the parent reports its own one-line price', async () => {
    // WooCommerce fills a variable parent's `price` with the cheapest variation,
    // so trusting it shows "$17.95" for a product that also sells at $19.95 — a
    // single figure standing for every option. The range comes from the variation
    // rows the read already holds, and the parent's lower figure is kept as the floor.
    useWordPress(routes([{ ...VARIABLE_PARENT, price: '17.95', regular_price: '17.95' }]));

    const [product] = (await fetchAdminProducts({})) ?? [];

    expect(product.priceMin).toBe(17.95);
    expect(product.priceMax).toBe(19.95);
    expect(product.priceRange).toBe(true);
    expect(product.price).toBe('$17.95 - $19.95');
  });

  it('does not raise a parent price the store reported below its variations', async () => {
    useWordPress(routes([{ ...VARIABLE_PARENT, price: '12.00', regular_price: '12.00' }]));

    const [product] = (await fetchAdminProducts({})) ?? [];

    expect(product.priceMin).toBe(12);
    expect(product.price).toBe('$12.00 - $19.95');
  });

  it('reads the variations once per variable product, and not at all for a simple one', async () => {
    const stub = useWordPress(routes([VARIABLE_PARENT, SIMPLE_PRODUCT]));

    const products = (await fetchAdminProducts({})) ?? [];

    expect(stub.callsTo(/\/wc\/v3\/products\/\d+\/variations/)).toHaveLength(1);
    expect(products[1].variations).toBeUndefined();
    expect(products[1].grainSizes).toBeUndefined();
  });

  it('resolves a slug a merge retired to the product that replaced it', async () => {
    // Hand-rolled, because the answer has to differ per slug: that is the whole
    // behaviour under test, and a stub with one fixed body cannot express it.
    const asked: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      const url = new URL(String(input));
      const slug = url.searchParams.get('slug') ?? '';
      asked.push(slug);
      const body = slug === 'himalayan-salt-6-lbs' ? [VARIABLE_PARENT] : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const product = await fetchAdminProductBySlug('himalayan-salt-coarse-grain-6-lbs');

    expect(asked).toContain('himalayan-salt-coarse-grain-6-lbs');
    expect(asked).toContain('himalayan-salt-6-lbs');
    expect(product?.id).toBe(2492);
  });

  it('leaves the options absent — never invented — when the variations cannot be read', async () => {
    // The origin fataled on the variations request, as the public product routes do
    // on this host. An unreadable option list must not become an empty selector that
    // looks like the product has no choices.
    useWordPress([
      { path: '/wc/v3/products', body: [VARIABLE_PARENT] },
      {
        path: /\/wc\/v3\/products\/\d+\/variations/,
        status: 500,
        raw: '<!DOCTYPE html><html><body><p>There has been a critical error on this website.</p></body></html>',
      },
    ]);

    const [product] = (await fetchAdminProducts({})) ?? [];

    expect(product.variations).toBeUndefined();
    expect(product.grainSizes).toBeUndefined();
    // The parent's own price is empty, so it stays unknown rather than becoming 0.
    expect(product.priceMin).toBeNull();
  });

  it('answers a live product\u2019s own slug before translating it as retired', async () => {
    // `pouches` is the live catalogue's own URL for the 6 lb pouches (id 2321) and
    // *also* a key in `RETIRED_PRODUCT_SLUGS`, pointing at a curated product that
    // exists only on the staging install. Translating before the lookup made this
    // live product's page a 404 while the catalogue was linking straight at it.
    const asked: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      const url = new URL(String(input));
      const slug = url.searchParams.get('slug') ?? '';
      asked.push(slug);
      const body = slug === 'pouches' ? [LIVE_POUCHES] : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const lookup = await readCatalogProductBySlug('pouches');

    expect(lookup.product?.id).toBe(2321);
    expect(asked).toContain('pouches');
    expect(asked).not.toContain('himalayan-salt-6-lbs');
  });

  it('still lands a genuinely retired slug on the product that replaced it', async () => {
    const asked: string[] = [];
    globalThis.fetch = (async (input: unknown) => {
      const url = new URL(String(input));
      asked.push(url.searchParams.get('slug') ?? '');
      const body = url.searchParams.get('slug') === 'himalayan-salt-6-lbs' ? [VARIABLE_PARENT] : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const lookup = await readCatalogProductBySlug('himalayan-salt-coarse-grain-6-lbs');

    expect(lookup.product?.id).toBe(2492);
  });
});
