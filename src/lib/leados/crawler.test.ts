import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRobotsAllowed,
  safeFetchHtml,
  isValidBusinessEmail,
  detectWholesaleSignals,
  calculateExtractionConfidence,
} from './crawler';

describe('LeadOS 3.3 Website Crawler & Security Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSRF Protection & Redirect Verification', () => {
    it('blocks loopback and private IP URLs directly', async () => {
      const loopbackResult = await safeFetchHtml('http://127.0.0.1/admin');
      expect(loopbackResult).toBeNull();

      const privateResult = await safeFetchHtml('http://192.168.1.1/router');
      expect(privateResult).toBeNull();

      const metadataResult = await safeFetchHtml('http://169.254.169.254/latest/meta-data');
      expect(metadataResult).toBeNull();
    });

    it('blocks SSRF attacks via HTTP redirects', async () => {
      // Mock fetch: initial URL is public, but redirects to 169.254.169.254
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('evil-redirect.com')) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { Location: 'http://169.254.169.254/secret' },
          }));
        }
        return Promise.resolve(new Response('<html>ok</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }));
      });

      const res = await safeFetchHtml('https://evil-redirect.com/login');
      expect(res).toBeNull();
    });
  });

  describe('Robots.txt & Site Policies', () => {
    it('evaluates robots.txt disallow rules correctly', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith('/robots.txt')) {
          const body = `
User-agent: *
Disallow: /admin
Disallow: /private/
Allow: /private/public-feed
Disallow: /restricted.html
          `;
          return Promise.resolve(new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          }));
        }
        return Promise.resolve(new Response('Not robots', { status: 404 }));
      });

      const allowed = await isRobotsAllowed('https://example-feed-store.com/products');
      expect(allowed).toBe(true);

      const disallowedAdmin = await isRobotsAllowed('https://example-feed-store.com/admin');
      expect(disallowedAdmin).toBe(false);

      const disallowedPrivate = await isRobotsAllowed('https://example-feed-store.com/private/data');
      expect(disallowedPrivate).toBe(false);
    });
  });

  describe('Business Email & Contact Validation', () => {
    it('validates genuine business emails and blocks spam/image patterns', () => {
      expect(isValidBusinessEmail('orders@texashorseranch.com')).toBe(true);
      expect(isValidBusinessEmail('contact@saltmineralsdirect.com')).toBe(true);

      // Block junk/spam/image patterns
      expect(isValidBusinessEmail('logo@2x.png')).toBe(false);
      expect(isValidBusinessEmail('info@domain.com')).toBe(false);
      expect(isValidBusinessEmail('test@example.com')).toBe(false);
      expect(isValidBusinessEmail('alert@sentry.io')).toBe(false);
    });
  });

  describe('Commercial Wholesale Signal Extraction', () => {
    it('detects wholesale and bulk distributor signals', () => {
      const wholesaleHtml = `
        <div>
          <h2>Wholesale & Dealer Inquiries</h2>
          <p>We supply bulk livestock feed and bulk pallet mineral licks to farm supply dealers across Texas.</p>
        </div>
      `;
      const detected = detectWholesaleSignals(wholesaleHtml);
      expect(detected.hasOpportunity).toBe(true);
      expect(detected.signals.length).toBeGreaterThan(0);
    });

    it('returns false for generic consumer retail without wholesale signals', () => {
      const consumerHtml = `
        <div>
          <p>Welcome to our small pet boutique. Buy dog treats online.</p>
        </div>
      `;
      const detected = detectWholesaleSignals(consumerHtml);
      expect(detected.hasOpportunity).toBe(false);
    });
  });

  describe('Confidence Scoring & Quality Stages', () => {
    it('grades high-quality verified contactable leads with high confidence', () => {
      const score = calculateExtractionConfidence({
        companyName: 'Brazos Valley Equine Feed',
        phone: '+1 979-555-1234',
        email: 'info@brazosfeed.com',
        address: '100 Ranch Road, Bryan, TX',
        hasWholesale: true,
        sourceCount: 3,
      });

      expect(score).toBeGreaterThanOrEqual(75);
    });
  });
});
