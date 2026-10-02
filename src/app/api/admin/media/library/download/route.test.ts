import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The download route hands the browser bytes it cannot read itself, so what
 * matters is: it only ever fetches the store's own WordPress origin, and the
 * filename the owner receives is the media title (uploads are stored under a
 * UUID, so a URL basename would be meaningless).
 */

const fetched: string[] = [];

vi.mock('@/lib/auth/verifyAdminRequest', () => ({
  verifyAdminRequest: async () => ({ ok: true, userId: 'test-admin', admin: {} }),
}));

vi.mock('@/lib/backend/wordpressCredentials', () => ({
  requireWordPressCredentials: () => ({ username: 'u', password: 'p' }),
}));

vi.mock('@/lib/backend/config', () => ({
  backendConfig: { wordpressBaseUrl: 'https://staging.test' },
}));

vi.mock('@/lib/backend/wordpress', () => {
  class WordPressApiError extends Error {
    status: number;
    constructor(input: { message: string; status: number }) {
      super(input.message);
      this.status = input.status;
    }
  }
  return {
    WordPressApiError,
    wordpressRequest: async (path: string) => {
      const id = Number(path.split('/').pop());
      if (id === 42) {
        return {
          id: 42,
          source_url: 'https://staging.test/wp-content/uploads/2026/10/9f2a-uuid.webp',
          title: { rendered: 'Gemini_Generated_Image.webp' },
          mime_type: 'image/webp',
        };
      }
      if (id === 43) {
        return {
          id: 43,
          source_url: 'https://evil.example/uploads/stolen.jpg',
          title: { rendered: 'stolen.jpg' },
          mime_type: 'image/jpeg',
        };
      }
      if (id === 44) {
        return {
          id: 44,
          source_url: 'https://staging.test/wp-content/uploads/download-broken.jpg',
          title: { rendered: 'download-broken.jpg' },
          mime_type: 'image/jpeg',
        };
      }
      return { id, source_url: '', title: { rendered: '' }, mime_type: '' };
    },
  };
});

const { mediaDownloadFilename } = await import('./route.utils');
const { GET } = await import('./route');

const url = (query: string) => new Request(`https://preview.test/api/admin/media/library/download${query}`);

beforeEach(() => {
  fetched.length = 0;
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const href = String(input);
    fetched.push(href);
    if (href.includes('download-broken')) {
      return new Response('nope', { status: 404 });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/webp', 'content-length': '4' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mediaDownloadFilename', () => {
  it('prefers a title that already looks like a file name', () => {
    expect(
      mediaDownloadFilename({
        id: 42,
        source_url: 'https://staging.test/wp-content/uploads/9f2a-uuid.webp',
        title: { rendered: 'Gemini_Generated_Image.webp' },
      })
    ).toBe('Gemini_Generated_Image.webp');
  });

  it('falls back to the stored file name when the title is a bare phrase', () => {
    expect(
      mediaDownloadFilename({
        id: 7,
        source_url: 'https://staging.test/wp-content/uploads/hero.jpg',
        title: { rendered: 'Our hero shot' },
      })
    ).toBe('hero.jpg');
  });

  it('never lets a path separator or a quote reach the header', () => {
    const name = mediaDownloadFilename({
      id: 8,
      source_url: 'https://staging.test/wp-content/uploads/x.jpg',
      title: { rendered: '../../evil";name.jpg' },
    });
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name).not.toContain('"');
    expect(name.endsWith('.jpg')).toBe(true);
  });
});

describe('GET /api/admin/media/library/download', () => {
  it('refuses a missing id', async () => {
    const response = await GET(url(''));
    expect(response.status).toBe(400);
    expect(fetched).toHaveLength(0);
  });

  it('refuses a file that is not on the store’s WordPress origin, without fetching it', async () => {
    const response = await GET(url('?id=43'));
    expect(response.status).toBe(400);
    expect(fetched).toHaveLength(0);
  });

  it('sends the file as an attachment under the media title', async () => {
    const response = await GET(url('?id=42'));
    expect(response.status).toBe(200);
    expect(fetched).toEqual(['https://staging.test/wp-content/uploads/2026/10/9f2a-uuid.webp']);

    const disposition = response.headers.get('content-disposition') || '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('Gemini_Generated_Image.webp');
    expect(response.headers.get('content-type')).toBe('image/webp');
  });

  it('reports the stored file’s own failure rather than an empty download', async () => {
    const response = await GET(url('?id=44'));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toContain('404');
  });
});
