import { describe, expect, it } from 'vitest';
import { normalizeCountry, resolveSourcingLane, WholesaleEngineError } from './engine';
import { renderQuoteDocument, type DocumentQuote } from './document';

describe('Sourcing Model & Billing Distinction', () => {
  describe('normalizeCountry', () => {
    it('normalizes various aliases to canonical names', () => {
      expect(normalizeCountry('PK')).toBe('Pakistan');
      expect(normalizeCountry('Karachi')).toBe('Pakistan');
      expect(normalizeCountry('khewra')).toBe('Pakistan');

      expect(normalizeCountry('CN')).toBe('China');
      expect(normalizeCountry('Shanghai')).toBe('China');

      expect(normalizeCountry('UK')).toBe('United Kingdom');
      expect(normalizeCountry('gb')).toBe('United Kingdom');
      expect(normalizeCountry('Great Britain')).toBe('United Kingdom');

      expect(normalizeCountry('USA')).toBe('United States');
      expect(normalizeCountry('us')).toBe('United States');
      expect(normalizeCountry('America')).toBe('United States');
    });
  });

  describe('resolveSourcingLane', () => {
    it('allows goods sourced from Pakistan to be delivered to USA', () => {
      const res = resolveSourcingLane({
        originCountry: 'Pakistan',
        originPort: 'PKKHI',
        destinationCountry: 'United States',
        destinationPort: 'USNYC',
      });
      expect(res.valid).toBe(true);
      expect(res.sourcingOriginCountry).toBe('Pakistan');
      expect(res.physicalDestinationCountry).toBe('United States');
      expect(res.billingCountry).toBe('United States');
      expect(res.billedAsUsDelivery).toBe(false);
    });

    it('allows goods sourced from China to be delivered to USA', () => {
      const res = resolveSourcingLane({
        originCountry: 'China',
        originPort: 'CNSHA',
        destinationCountry: 'United States',
        destinationPort: 'USLAX',
      });
      expect(res.valid).toBe(true);
      expect(res.sourcingOriginCountry).toBe('China');
      expect(res.physicalDestinationCountry).toBe('United States');
      expect(res.billingCountry).toBe('United States');
      expect(res.billedAsUsDelivery).toBe(false);
    });

    it('requires UK customers to be served out of Pakistan and billed as a USA delivery', () => {
      const res = resolveSourcingLane({
        originCountry: 'Pakistan',
        originPort: 'PKKHI',
        destinationCountry: 'United Kingdom',
        destinationPort: 'GBFXT',
      });
      expect(res.valid).toBe(true);
      expect(res.sourcingOriginCountry).toBe('Pakistan');
      expect(res.physicalDestinationCountry).toBe('United Kingdom');
      expect(res.billingCountry).toBe('United States');
      expect(res.billedAsUsDelivery).toBe(true);
      expect(res.note).toContain('UK customer served out of Pakistan and billed as a USA delivery');
    });

    it('strictly refuses UK orders sourced out of China', () => {
      const res = resolveSourcingLane({
        originCountry: 'China',
        originPort: 'CNSHA',
        destinationCountry: 'United Kingdom',
        destinationPort: 'GBFXT',
      });
      expect(res.valid).toBe(false);
      expect(res.error).toBe('UK customers must be served out of Pakistan, not China.');
    });
  });

  describe('Quotation Document Sourcing & Billing Display', () => {
    it('renders UK quotation stating physical destination, Pakistan origin, and USA delivery billing', () => {
      const quote: DocumentQuote = {
        id: 'Q_UK_1',
        reference: 'HK-WS-Q00099',
        currency: 'USD',
        incoterm: 'CIF',
        destinationCountry: 'United Kingdom',
        destinationPort: 'GBFXT',
        containers: 1,
        sellTotal: 25000,
        lines: [
          {
            name: 'Fine Pink Salt 2.5kg',
            wholesaleSku: 'HK-FINE-25',
            units: 1000,
            cartons: 250,
            unitPrice: 25,
            lineTotal: 25000,
          },
        ],
      };

      const html = renderQuoteDocument({
        quote,
        account: {
          id: 'acc_1',
          companyName: 'British Gourmet Salt Ltd',
          contactName: 'James Watson',
          email: 'j.watson@example.co.uk',
          country: 'United Kingdom',
        } as any,
      });

      // Validates the lane / sourcing / billing distinction in the rendered HTML
      expect(html).toContain('Physical destination: <strong>United Kingdom</strong>');
      expect(html).toContain('Port of discharge: GBFXT');
      expect(html).toContain('Sourcing origin: <strong>Pakistan</strong> (served out of Pakistan)');
      expect(html).toContain('Commercial billing: <strong>Billed as USA Delivery (USD)</strong>');
      expect(html).toContain('Commercial terms: UK shipment served out of Pakistan and billed as a USA delivery.');
    });

    it('renders standard US quotation without forcing UK terms', () => {
      const quote: DocumentQuote = {
        id: 'Q_US_1',
        reference: 'HK-WS-Q00100',
        currency: 'USD',
        incoterm: 'FOB',
        destinationCountry: 'United States',
        destinationPort: 'USNYC',
        containers: 1,
        sellTotal: 30000,
        lines: [],
      };

      const html = renderQuoteDocument({
        quote,
        account: null,
      });

      expect(html).toContain('Physical destination: <strong>United States</strong>');
      expect(html).toContain('Commercial billing: <strong>Direct United States Delivery (USD)</strong>');
      expect(html).not.toContain('served out of Pakistan and billed as a USA delivery');
    });
  });
});
