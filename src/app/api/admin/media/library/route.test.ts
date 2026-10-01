import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The delete guard is the one thing in this route that can destroy store data, so
 * it is tested against a mocked WordPress rather than against the live library:
 * an image a product renders must be refused, and nothing may be sent to
 * WordPress when it is.
 */

const calls: { method: string; path: string; params?: unknown }[] = [];

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: async () => ({ ok: true, userId: 'test-admin', admin: {} }),
}));

vi.mock('@/lib/backend/wordpressCredentials', () => ({
  requireWordPressCredentials: () => ({ username: 'u', password: 'p' }),
}));

vi.mock('@/lib/backend/serverCatalog', () => ({
  getCatalogProducts: async () => ({
    products: [
      {
        id: '2653',
        name: 'Edible Pink Salt 16 oz',
        images: ['https://staging.test/wp-content/uploads/2026/09/edible-jar.jpg'],
      },
    ],
  }),
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
      return {
        data: [
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
        ],
        status: 200,
        total: 2,
        totalPages: 1,
      };
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
});
