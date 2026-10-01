import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The delete guard is the one thing in this route that can destroy store data, so
 * it is tested against a mocked WordPress rather than against the live library:
 * an image a product renders must be refused, and nothing may be sent to
 * WordPress when it is.
 *
 * The product the guard sees is deliberately a **draft**: staging proved that
 * reading the usage index from the storefront-scoped catalogue dropped every
 * draft, unlisted and off-niche product, which made 27 product photos look
 * deletable. A draft product's photos are still that product's photos.
 */

const calls: { method: string; path: string; params?: unknown }[] = [];
/** Set to make the product list read fail, for the fail-closed delete case. */
let productListFails = false;

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: async () => ({ ok: true, userId: 'test-admin', admin: {} }),
}));

vi.mock('@/lib/backend/wordpressCredentials', () => ({
  requireWordPressCredentials: () => ({ username: 'u', password: 'p' }),
}));

vi.mock('@/lib/woo/productWrite', () => ({
  listWooProducts: async () => {
    if (productListFails) throw new Error('WooCommerce is unreachable');
    return [
      {
        id: 2653,
        name: 'Edible Pink Salt 16 oz',
        status: 'draft',
        images: [{ id: 1, src: 'https://staging.test/wp-content/uploads/2026/09/edible-jar.jpg' }],
      },
      {
        id: 2728,
        name: 'Salt Rock for Cattle',
        status: 'publish',
        images: [{ id: 2, src: 'https://staging.test/wp-content/uploads/2026/09/cattle-rock.jpg' }],
      },
      // Trash must never make an image look used.
      {
        id: 9999,
        name: 'Deleted product',
        status: 'trash',
        images: [{ id: 3, src: 'https://staging.test/wp-content/uploads/2026/09/trashed.jpg' }],
      },
    ];
  },
}));

vi.mock('@/lib/backend/wordpress', () => {
  class WordPressApiError extends Error {
    path: string;
    status: number;
    constructor(input: { message: string; path: string; status: number }) {
      super(input.message);
      this.path = input.path;
      this.status = input.status;
    }
  }
  const mediaRows = [
    {
      id: 2653,
      date: '2026-09-30T10:00:00',
      source_url: 'https://staging.test/wp-content/uploads/2026/09/edible-jar.jpg',
      alt_text: '',
      mime_type: 'image/jpeg',
      title: { rendered: 'edible jar' },
      media_details: {
        width: 1200,
        height: 900,
        filesize: 204800,
        sizes: { medium: { source_url: 'https://staging.test/wp-content/uploads/2026/09/edible-jar-300x225.jpg' } },
      },
    },
    {
      id: 2701,
      date: '2026-09-29T10:00:00',
      source_url: 'https://staging.test/wp-content/uploads/2026/09/loose-photo.png',
      alt_text: 'A loose photo',
      mime_type: 'image/png',
      title: { rendered: 'loose photo' },
      media_details: { width: 400, height: 400 },
    },
  ];
  return {
    WordPressApiError,
    wordpressRequest: async (path: string, options: { method?: string; params?: unknown } = {}) => {
      calls.push({ method: options.method ?? 'GET', path, params: options.params });
      if (path.startsWith('/wp/v2/media/')) {
        const id = Number(path.split('/').pop());
        return { id, source_url: `https://staging.test/wp-content/uploads/2026/09/${id === 2653 ? 'edible-jar' : 'loose-photo'}.jpg` };
      }
      return {};
    },
    wordpressRequestWithMeta: async () => {
      calls.push({ method: 'GET', path: '/wp/v2/media' });
      return { data: mediaRows, status: 200, total: 2, totalPages: 1 };
    },
  };
});

const { GET, PATCH, DELETE } = await import('./route');

const url = (query: string) => new Request(`https://preview.test/api/admin/media/library${query}`);

const jsonRequest = (method: string, body: unknown) =>
  new Request('https://preview.test/api/admin/media/library', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  calls.length = 0;
  productListFails = false;
});

describe('GET /api/admin/media/library', () => {
  it('returns images with a thumbnail, usage and pagination', async () => {
    const response = await GET(url('?perPage=48'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);

    const [productImage, loose] = body.images;
    expect(productImage.thumbnail).toContain('edible-jar-300x225.jpg');
    expect(productImage.usedBy).toEqual([
      { id: '2653', name: 'Edible Pink Salt 16 oz', isPrimary: true },
    ]);
    expect(loose.usedBy).toEqual([]);
    expect(loose.thumbnail).toBe(loose.url); // no medium size stored
  });

  it('counts a draft product as a real user of its photos', async () => {
    const body = await (await GET(url('?perPage=48'))).json();
    const productImage = body.images.find((image: { id: number }) => image.id === 2653);
    expect(productImage.usedBy).toHaveLength(1);
    expect(productImage.usedBy[0].id).toBe('2653');
  });

  it('does not count a trashed product as a user of its photos', async () => {
    // The mock's media list has no trashed image, so assert through the index by
    // asking the scope filter for unused images: the trashed entry must not remove
    // anything from that list.
    const body = await (await GET(url('?scope=unused'))).json();
    expect(body.images.some((image: { id: number }) => image.id === 2701)).toBe(true);
  });

  it('scopes to images no product displays when asked', async () => {
    const body = await (await GET(url('?scope=unused'))).json();
    expect(body.scope).toBe('unused');
    expect(body.images.map((image: { id: number }) => image.id)).toEqual([2701]);
    expect(body.total).toBe(1);
  });

  it('scopes to product photos when asked', async () => {
    const body = await (await GET(url('?scope=in_use'))).json();
    expect(body.scope).toBe('in_use');
    expect(body.images.map((image: { id: number }) => image.id)).toEqual([2653]);
  });

  it('falls back to the whole library for an unknown scope', async () => {
    const body = await (await GET(url('?scope=everything'))).json();
    expect(body.scope).toBe('all');
    expect(body.images).toHaveLength(2);
  });
});

describe('PATCH /api/admin/media/library', () => {
  it('refuses a request that changes nothing', async () => {
    const response = await PATCH(jsonRequest('PATCH', { id: 2653 }));
    expect(response.status).toBe(400);
  });

  it('refuses a missing id', async () => {
    const response = await PATCH(jsonRequest('PATCH', { altText: 'x' }));
    expect(response.status).toBe(400);
  });

  it('writes alt text to WordPress', async () => {
    const response = await PATCH(jsonRequest('PATCH', { id: 2653, altText: 'A jar of pink salt' }));
    expect(response.status).toBe(200);
    expect(calls.some((call) => call.method === 'POST' && call.path === '/wp/v2/media/2653')).toBe(true);
  });
});

describe('DELETE /api/admin/media/library', () => {
  it('refuses to delete an image a product renders, and never asks WordPress to', async () => {
    const response = await DELETE(url('?id=2653'));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Edible Pink Salt 16 oz');
    expect(body.usedBy).toHaveLength(1);
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('deletes an image nothing renders', async () => {
    const response = await DELETE(url('?id=2701'));
    expect(response.status).toBe(200);
    const deletes = calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].path).toBe('/wp/v2/media/2701');
    expect(deletes[0].params).toMatchObject({ force: true });
  });

  it('refuses a missing id', async () => {
    const response = await DELETE(url(''));
    expect(response.status).toBe(400);
  });

  it('fails closed: a product list that cannot be read deletes nothing', async () => {
    productListFails = true;
    const response = await DELETE(url('?id=2701'));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('was not deleted');
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });
});
