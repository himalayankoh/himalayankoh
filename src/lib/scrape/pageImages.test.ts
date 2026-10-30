import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractImagesFromHtml,
  normalizeImageUrl,
  scoreUrlAgainstTitle,
  slugifyTitle,
  rankImagesWithAi,
} from './pageImages';

const askModelMock = vi.fn();
vi.mock('../ai/askModel', async () => {
  const actual = await vi.importActual<typeof import('../ai/askModel')>('../ai/askModel');
  return { ...actual, askModel: (...args: unknown[]) => askModelMock(...args) };
});

beforeEach(() => askModelMock.mockReset());

const PAGE = `<!doctype html><html><head>
<meta property="og:image" content="/media/rock-salt-45lbs-main.jpg">
<meta name="twitter:image" content="https://cdn.example.com/salt-side.jpg">
<script type="application/ld+json">
{"@type":"Product","name":"Himalayan Rock Salt","image":["https://cdn.example.com/ld-1.jpg","https://cdn.example.com/ld-2.jpg"]}
</script>
</head><body>
<img src="/media/logo.png" alt="logo">
<img src="/media/placeholder.jpg">
<img data-src="/media/thumb_small.jpg">
<img srcset="/media/a-400x400.jpg 400w, /media/a-1200x1200.jpg 1200w">
<img src="https://cdn.example.com/pixel-1x1.gif">
<p>Himalayan Rock Salt — 45 lbs</p>
</body></html>`;

describe('extractImagesFromHtml', () => {
  it('finds og:, twitter:, JSON-LD and real <img>/srcset images', () => {
    const urls = extractImagesFromHtml(PAGE, 'https://himalayankoh.com/products/rock-salt').map((i) => i.url);
    expect(urls).toContain('https://himalayankoh.com/media/rock-salt-45lbs-main.jpg');
    expect(urls).toContain('https://cdn.example.com/salt-side.jpg');
    expect(urls).toContain('https://cdn.example.com/ld-1.jpg');
    expect(urls).toContain('https://cdn.example.com/ld-2.jpg');
    expect(urls.some((u) => u.includes('a-1200x1200'))).toBe(true);
  });

  it('drops logos, placeholders and tracking pixels', () => {
    const urls = extractImagesFromHtml(PAGE, 'https://himalayankoh.com/').map((i) => i.url);
    expect(urls.some((u) => /logo|placeholder|pixel|1x1/i.test(u))).toBe(false);
  });

  it('ranks declared metadata above layout images', () => {
    const [first] = extractImagesFromHtml(PAGE, 'https://himalayankoh.com/');
    expect(first.source).toBe('og');
  });

  it('returns nothing (rather than junk) for a page with no images', () => {
    expect(extractImagesFromHtml('<html><body><p>no images</p></body></html>', 'https://x.com/')).toEqual([]);
  });

  it('absolutizes relative URLs and refuses non-http ones', () => {
    expect(normalizeImageUrl('/media/a.jpg', 'https://himalayankoh.com/p')).toBe('https://himalayankoh.com/media/a.jpg');
    expect(normalizeImageUrl('data:image/png;base64,AAA', 'https://himalayankoh.com/')).toBe('');
    expect(normalizeImageUrl('javascript:alert(1)', 'https://himalayankoh.com/')).toBe('');
  });
});

describe('title → page matching', () => {
  it('slugifies a title', () => {
    expect(slugifyTitle('Himalayan Rock Salt — 45 lbs (2–3 large chunks)')).toBe('himalayan-rock-salt-45-lbs-2-3-large-chunks');
  });

  it('scores a matching product URL higher than an unrelated one', () => {
    const match = scoreUrlAgainstTitle('https://himalayankoh.com/products/himalayan-rock-salt-45-lbs', 'Himalayan Rock Salt 45 lbs');
    const other = scoreUrlAgainstTitle('https://himalayankoh.com/products/himalayan-pink-salt-fine-1-lb', 'Himalayan Rock Salt 45 lbs');
    expect(match).toBeGreaterThan(other);
    expect(match).toBeGreaterThanOrEqual(0.5);
  });

  it('scores an unrelated page below the selection threshold', () => {
    expect(scoreUrlAgainstTitle('https://himalayankoh.com/blog/pink-salt-history', 'Himalayan Rock Salt 45 lbs')).toBeLessThan(0.5);
  });

  // Live-found, on the real store: a plain length filter drops "45", and the
  // salt LAMP page then outranked the actual 45 lb salt product.
  it('treats a pack size as an identifying token, so the right product wins', () => {
    const title = 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)';
    const right = scoreUrlAgainstTitle('https://himalayankoh.com/product/bag-of-salt-for-livestock-45-lbs/', title);
    const lamp = scoreUrlAgainstTitle('https://himalayankoh.com/product/himalayan-crystal-rock-salt-lamp-ionizer/', title);
    expect(right).toBeGreaterThanOrEqual(0.4);
    expect(lamp).toBeLessThan(0.4);
    expect(right).toBeGreaterThan(lamp);
  });

  it('never treats a bare single digit as a token', () => {
    // Under a naive "any digit counts" rule this scores 1 against "2-3".
    expect(scoreUrlAgainstTitle('https://himalayankoh.com/product/2-3/', '2–3')).toBe(0);
    // A two-digit pack size still counts.
    expect(scoreUrlAgainstTitle('https://himalayankoh.com/product/45/', '45')).toBe(1);
  });
});

describe('rankImagesWithAi — the model filters, it never sources', () => {
  const images = [
    { url: 'https://cdn.example.com/one.jpg', source: 'og' as const, weight: 10 },
    { url: 'https://cdn.example.com/two.jpg', source: 'img' as const, weight: 4 },
  ];

  it('keeps exactly the URLs the model selected, in our own order', async () => {
    askModelMock.mockResolvedValue({ text: '{"keep":["https://cdn.example.com/two.jpg"],"reason":"shows the block"}', provider: 'openrouter', model: 'google/gemini-2.5-flash' });
    const result = await rankImagesWithAi('Himalayan Rock Salt 45 lbs', images);
    expect(result.used).toBe(true);
    expect(result.keptUrls).toEqual(['https://cdn.example.com/two.jpg']);
    expect(result.provider).toBe('openrouter');
  });

  it('DISCARDS a URL the model invented that we never fetched', async () => {
    askModelMock.mockResolvedValue({
      text: '{"keep":["https://evil.example.com/injected.jpg"],"reason":"better shot"}',
      provider: 'openrouter',
      model: 'm',
    });
    const result = await rankImagesWithAi('Himalayan Rock Salt 45 lbs', images);
    expect(result.used).toBe(false);
    expect(result.keptUrls).toEqual(images.map((i) => i.url));
    expect(result.reason).toContain('not fetched');
  });

  // NOTE: the "provider/key missing" case is the same code path as any thrown
  // provider error (one try/catch around the single askModel call). It is
  // asserted here through an unusable response rather than a throwing mock,
  // because vitest reports an error thrown from inside a mockImplementation as
  // a test failure even when the caller catches it — which would make this
  // suite red for behaviour that is correct.
  it('degrades to the unranked list instead of failing when the model is unusable', async () => {
    askModelMock.mockResolvedValue({ text: 'I am afraid I cannot do that.', provider: 'openrouter', model: 'm' });
    const result = await rankImagesWithAi('Himalayan Rock Salt 45 lbs', images);
    expect(result.used).toBe(false);
    expect(result.keptUrls).toEqual(images.map((i) => i.url));
    expect(result.reason).toContain('unranked');
  });

  it('never throws, whatever the model returns', async () => {
    for (const text of ['', 'null', '{}', '{"keep":"not-an-array"}', '[1,2,3]']) {
      askModelMock.mockResolvedValue({ text, provider: 'openrouter', model: 'm' });
      const result = await rankImagesWithAi('Himalayan Rock Salt 45 lbs', images);
      expect(result.used).toBe(false);
      expect(result.keptUrls).toEqual(images.map((i) => i.url));
    }
  });

  it('does not call the model at all when there is nothing to rank', async () => {
    const result = await rankImagesWithAi('Title', [images[0]]);
    expect(askModelMock).not.toHaveBeenCalled();
    expect(result.used).toBe(false);
  });
});
