import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAcknowledgementHtml,
  buildInquiryHtml,
  buildInquiryText,
  formatMoney,
  inquirySubject,
  wholesaleInquiryRecipient,
  wholesaleSender,
  type WholesaleInquiryInput,
} from './wholesaleInquiry';

const INPUT: WholesaleInquiryInput = {
  reference: 'HK-WS-Q00042',
  buyer: {
    businessName: 'Gulf Coast Grocers LLC',
    contactName: 'Maria Alvarez',
    email: 'maria@gulfcoastgrocers.example',
    phone: '+1 713 555 0142',
  },
  lines: [
    { name: 'Fine Grain 25 kg', sku: 'HK-FG-25', units: 40, unitPrice: 7.5 },
    { name: 'Salt Lick 2 kg', sku: 'HK-SL-2', units: 20, unitPrice: 16 },
  ],
  currency: 'USD',
  estimatedMerchandise: 620,
  shippingAddress: '1200 Ship Channel Rd, Houston, TX 77015',
  destinationPort: 'USHOU',
  notes: 'Please advise the earliest sailing.',
  adminUrl: 'https://himalayankoh.com/admin/wholesale#quotes',
};

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('formatMoney', () => {
  it('renders two decimals and thousands separators', () => {
    expect(formatMoney(620, 'USD')).toBe('USD 620.00');
    expect(formatMoney(1234.5, 'USD')).toBe('USD 1,234.50');
  });

  it('survives a non-finite number', () => {
    expect(formatMoney(Number.NaN, 'USD')).toBe('USD 0.00');
  });
});

describe('recipient', () => {
  it('defaults to the wholesale mailbox', () => {
    delete process.env.WHOLESALE_INQUIRY_EMAIL;
    expect(wholesaleInquiryRecipient()).toBe('ws@himalayankoh.com');
  });

  it('honours a well-formed override', () => {
    process.env.WHOLESALE_INQUIRY_EMAIL = 'trade@example.com';
    expect(wholesaleInquiryRecipient()).toBe('trade@example.com');
  });

  it('refuses a malformed override rather than sending a buyer’s details nowhere', () => {
    process.env.WHOLESALE_INQUIRY_EMAIL = 'not-an-address';
    expect(wholesaleInquiryRecipient()).toBe('ws@himalayankoh.com');
    process.env.WHOLESALE_INQUIRY_EMAIL = 'someone@example.com\r\nBcc: victim@example.com';
    expect(wholesaleInquiryRecipient()).toBe('ws@himalayankoh.com');
  });

  it('uses the same guard for the sender', () => {
    delete process.env.WHOLESALE_FROM_EMAIL;
    expect(wholesaleSender()).toBe('ws@himalayankoh.com');
    process.env.WHOLESALE_FROM_EMAIL = 'wholesale@example.com';
    expect(wholesaleSender()).toBe('wholesale@example.com');
  });
});

describe('subject', () => {
  it('names the inquiry and the business', () => {
    expect(inquirySubject(INPUT)).toBe('Wholesale inquiry HK-WS-Q00042 — Gulf Coast Grocers LLC');
  });
});

describe('HTML body', () => {
  it('carries the reference, buyer, every line and the estimated total', () => {
    const html = buildInquiryHtml(INPUT);
    expect(html).toContain('HK-WS-Q00042');
    expect(html).toContain('Gulf Coast Grocers LLC');
    expect(html).toContain('maria@gulfcoastgrocers.example');
    expect(html).toContain('HK-FG-25');
    expect(html).toContain('40');
    expect(html).toContain('USD 300.00');
    expect(html).toContain('USD 320.00');
    expect(html).toContain('USD 620.00');
    expect(html).toContain('USHOU');
    expect(html).toContain('Please advise the earliest sailing.');
    expect(html).toContain('https://himalayankoh.com/admin/wholesale#quotes');
  });

  it('says the figures are indicative, not a quotation', () => {
    expect(buildInquiryHtml(INPUT)).toMatch(/Indicative only/i);
    expect(buildInquiryHtml(INPUT)).toMatch(/not a paid order/i);
  });

  it('escapes anything a buyer typed', () => {
    const html = buildInquiryHtml({
      ...INPUT,
      buyer: { ...INPUT.buyer, businessName: '<script>alert(1)</script>', contactName: 'A & B' },
      notes: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('<img src=x');
  });

  it('says so when a line has no price instead of inventing one', () => {
    const html = buildInquiryHtml({
      ...INPUT,
      lines: [{ name: 'Bulk Rock Salt', sku: 'HK-RS', units: 100, unitPrice: null }],
      estimatedMerchandise: null,
    });
    expect(html).toContain('no tier price');
    expect(html).toContain('not priced');
  });
});

describe('text body', () => {
  it('is readable without HTML and carries the reply instruction', () => {
    const text = buildInquiryText(INPUT);
    expect(text).toContain('Wholesale inquiry HK-WS-Q00042');
    expect(text).toContain('- Fine Grain 25 kg (HK-FG-25): 40 units');
    expect(text).toContain('USD 620.00');
    expect(text).toContain('Reply to this email to answer Maria Alvarez.');
    expect(text).not.toContain('<');
  });
});

describe('acknowledgement', () => {
  it('promises a quotation and no payment', () => {
    const html = buildAcknowledgementHtml(INPUT);
    expect(html).toContain('HK-WS-Q00042');
    expect(html).toContain('Maria Alvarez');
    expect(html).toMatch(/not a quotation/i);
    expect(html).toMatch(/No payment has been taken/i);
  });
});
