import { describe, expect, it } from 'vitest';
import type { InboxMessage } from './inboxStore';
import { buildReplyAllCc } from './replyRecipients';

function message(overrides: Partial<InboxMessage>): InboxMessage {
  return {
    id: 'm1',
    threadId: 't1',
    messageId: '<m1@himalayankoh.com>',
    inReplyTo: null,
    references: [],
    mailbox: 'sales@himalayankoh.com',
    correspondenceType: 'business_correspondence',
    direction: 'inbound',
    folder: 'inbox',
    from: { name: 'Buyer', email: 'buyer@example.com' },
    to: [{ email: 'sales@himalayankoh.com' }],
    cc: [],
    bcc: [],
    subject: 'Wholesale enquiry',
    bodyText: 'Hello',
    bodyHtml: '',
    snippet: 'Hello',
    unread: false,
    starred: false,
    labels: [],
    attachments: [],
    leadId: null,
    leadBusinessName: null,
    leadStage: null,
    deliveryStatus: 'delivered',
    deliveryNote: '',
    authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
    ...overrides,
  } as InboxMessage;
}

describe('buildReplyAllCc', () => {
  it('adds the other recipients but not the sender or our own mailbox', () => {
    const last = message({
      to: [{ email: 'sales@himalayankoh.com' }, { email: 'ops@himalayankoh.com' }],
      cc: [{ name: 'Buyer Two', email: 'Buyer2@Example.com' }, { email: 'buyer@example.com' }],
    });

    expect(buildReplyAllCc(last, 'sales@himalayankoh.com')).toBe('ops@himalayankoh.com, buyer2@example.com');
  });

  it('returns nothing when the only other participant is the sender', () => {
    expect(buildReplyAllCc(message({}), 'sales@himalayankoh.com')).toBe('');
  });

  it('uses the outbound recipient as the primary address for a sent message', () => {
    const last = message({
      direction: 'outbound',
      from: { name: 'Himalayan Koh Sales', email: 'sales@himalayankoh.com' },
      to: [{ email: 'buyer@example.com' }],
      cc: [{ email: 'accounting@example.com' }],
    });

    expect(buildReplyAllCc(last, 'sales@himalayankoh.com')).toBe('accounting@example.com');
  });

  it('ignores malformed addresses and handles a missing message', () => {
    const last = message({
      to: [{ email: 'not-an-email' }, { email: 'sales@himalayankoh.com' }],
      cc: [{ email: '  partner@example.com ' }],
    });

    expect(buildReplyAllCc(last, 'sales@himalayankoh.com')).toBe('partner@example.com');
    expect(buildReplyAllCc(undefined, 'sales@himalayankoh.com')).toBe('');
  });
});
