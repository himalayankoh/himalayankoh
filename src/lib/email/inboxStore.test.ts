import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetSetting = vi.fn();
const mockUpsertSettings = vi.fn();
const mockListSavedLeads = vi.fn();
const mockGetSavedLeadById = vi.fn();
const mockUpdateSavedLead = vi.fn();
const mockListCrmLeads = vi.fn();
const mockLeadosRequest = vi.fn();
const mockRecordAuditEntry = vi.fn();

vi.mock('@/lib/settings/serverSettings', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  upsertSettings: (...args: unknown[]) => mockUpsertSettings(...args),
}));

vi.mock('@/lib/leados/db', () => ({
  listSavedLeads: (...args: unknown[]) => mockListSavedLeads(...args),
  getSavedLeadById: (...args: unknown[]) => mockGetSavedLeadById(...args),
  updateSavedLead: (...args: unknown[]) => mockUpdateSavedLead(...args),
  leadosRequest: (...args: unknown[]) => mockLeadosRequest(...args),
  recordAuditEntry: (...args: unknown[]) => mockRecordAuditEntry(...args),
}));

vi.mock('@/lib/leados/crm', () => ({
  listCrmLeads: (...args: unknown[]) => mockListCrmLeads(...args),
}));

vi.mock('@/lib/wordpress/siteContent', () => ({
  siteSettingsApi: {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
  },
}));

import {
  saveInboxDraft,
  sendInboxMessage,
  recordInboundEmail,
  getMailboxAndInfrastructureStatus,
  listInboxState,
  resetInboxMemoryCacheForTests,
} from './inboxStore';

describe('Admin Email Inbox Store & Threading Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInboxMemoryCacheForTests();

    // Default mock returns: no existing messages in WordPress settings
    mockGetSetting.mockResolvedValue(null);
    mockUpsertSettings.mockResolvedValue({ ok: true, saved: 1, verified: true });
    mockListSavedLeads.mockResolvedValue([]);
    mockListCrmLeads.mockResolvedValue([]);
    mockLeadosRequest.mockResolvedValue({ items: [] });
  });

  it('refreshes persisted mailbox data written by another Worker isolate', async () => {
    const clock = vi.spyOn(Date, 'now');
    const at = Date.now();
    try {
      clock.mockReturnValue(at);
      resetInboxMemoryCacheForTests();
      await listInboxState({ folder: 'ws', skipExternalSync: true });
      const remoteMessage = {
        id: 'remote-ws', messageId: '<remote-ws@example.test>', mailbox: 'ws@himalayankoh.com',
        direction: 'inbound', folder: 'inbox', subject: 'Remote inquiry', bodyText: 'New inquiry',
        from: { email: 'ws@himalayankoh.com' }, to: [{ email: 'ws@himalayankoh.com' }],
        createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString(), read: false,
      };
      mockGetSetting.mockResolvedValue(JSON.stringify([remoteMessage]));
      clock.mockReturnValue(at + 15_001);
      const result = await listInboxState({ folder: 'ws', skipExternalSync: true });
      expect(result.messages.some((message) => message.id === 'remote-ws')).toBe(true);
      expect(mockGetSetting).toHaveBeenCalledWith('email_inbox', 'messages_json', { fresh: true });
    } finally { clock.mockRestore(); }
  });

  it('accurately reports the authorized mailbox identities and DNS infrastructure', async () => {
    const { mailboxes, infrastructure } = await getMailboxAndInfrastructureStatus();

    expect(mailboxes).toHaveLength(6);
    const salman = mailboxes.find((m) => m.address === 'salman@himalayankoh.com');
    const sales = mailboxes.find((m) => m.address === 'sales@himalayankoh.com');
    const support = mailboxes.find((m) => m.address === 'support@himalayankoh.com');
    const orders = mailboxes.find((m) => m.address === 'orders@himalayankoh.com');
    const marketing = mailboxes.find((m) => m.address === 'marketing@himalayankoh.com');
    const ws = mailboxes.find((m) => m.address === 'ws@himalayankoh.com');
    const admin = mailboxes.find((m) => m.address === 'admin@himalayankoh.com');

    expect(salman).toBeDefined();
    expect(salman?.displayName).toBe('Salman — Himalayan Koh');
    expect(sales).toBeUndefined();
    expect(support).toBeDefined();
    expect(support?.displayName).toBe('Himalayan Koh Customer Support');
    expect(orders).toBeDefined();
    expect(orders?.displayName).toBe('Himalayan Koh Orders & Fulfillment');
    expect(marketing).toBeDefined();
    expect(marketing?.displayName).toBe('Himalayan Koh Marketing');
    expect(ws).toBeDefined();
    expect(ws?.displayName).toBe('Himalayan Koh Wholesale Department');
    expect(admin).toBeDefined();
    expect(admin?.displayName).toBe('Himalayan Koh Administration');

    expect(infrastructure.spf.status).toBe('PASS');
    expect(infrastructure.dkim.status).toBe('2048-bit Active');
    expect(infrastructure.dmarc.status).toBe('PASS');
    expect(infrastructure.mx.records[0]).toContain('jellyfish.systems');
  });

  it('saving a draft stores in the drafts folder and NEVER dispatches an email', async () => {
    mockListSavedLeads.mockResolvedValue([
      {
        id: 'lead-123',
        businessName: 'Lone Star Equine Supply',
        email: 'buyer@lonestarequine.com',
        status: 'qualified',
      },
    ]);

    const draft = await saveInboxDraft({
      mailbox: 'support@himalayankoh.com',
      to: 'buyer@lonestarequine.com',
      subject: 'Equine Salt Lick Catalog',
      bodyText: 'Hello team, attached is our commercial salt catalog.',
    });

    expect(draft.id).toBeDefined();
    expect(draft.folder).toBe('drafts');
    expect(draft.direction).toBe('outbound');
    expect(draft.deliveryStatus).toBe('draft');
    expect(draft.leadId).toBe('lead-123');
    expect(draft.leadBusinessName).toBe('Lone Star Equine Supply');
    expect(draft.to[0].email).toBe('buyer@lonestarequine.com');
    expect(draft.subject).toBe('Equine Salt Lick Catalog');

    // Verify draft was saved to settings
    expect(mockUpsertSettings).toHaveBeenCalledTimes(1);
    const savedArg = mockUpsertSettings.mock.calls[0][1];
    expect(savedArg.messages_json).toContain('Equine Salt Lick Catalog');
  });

  it('sending a reply preserves threadId, inReplyTo, and references headers', async () => {
    // Seed an initial inbound message
    const inboundRes = await recordInboundEmail({
      messageId: '<inbound-101@client.com>',
      mailbox: 'support@himalayankoh.com',
      from: { name: 'Dr. Jane Smith', email: 'jane@vetclinics.org' },
      to: [{ email: 'support@himalayankoh.com' }],
      subject: 'Inquiry regarding 2lb pink salt blocks',
      bodyText: 'Can you provide a pallet price for the 2lb blocks?',
      authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    });

    const inbound = inboundRes.message;
    expect(inboundRes.duplicate).toBe(false);
    expect(inbound.messageId).toBe('<inbound-101@client.com>');
    expect(inbound.folder).toBe('inbox');

    // Send a reply
    const reply = await sendInboxMessage({
      replyToMessageId: inbound.id,
      mailbox: 'support@himalayankoh.com',
      to: 'jane@vetclinics.org',
      subject: 'Re: Inquiry regarding 2lb pink salt blocks',
      bodyText: 'Hello Dr. Smith, thank you for your inquiry. Pallet pricing is attached.',
    });

    expect(reply.folder).toBe('sent');
    expect(reply.threadId).toBe(inbound.threadId);
    expect(reply.inReplyTo).toBe('<inbound-101@client.com>');
    expect(reply.references).toContain('<inbound-101@client.com>');
    expect(reply.from.email).toBe('support@himalayankoh.com');

    // When listing inbox, verify thread grouping
    const state = await listInboxState({ folder: 'sent' });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe(reply.id);
  });

  it('receiving an inbound email deduplicates by messageId and links matching LeadOS prospect', async () => {
    mockListSavedLeads.mockResolvedValue([
      {
        id: 'lead-montana-77',
        businessName: 'Montana Ranch Feed',
        email: 'orders@montanaranchfeed.com',
        status: 'contacted',
      },
    ]);

    const inboundRes = await recordInboundEmail({
      messageId: '<unique-msg-999@montanaranchfeed.com>',
      mailbox: 'support@himalayankoh.com',
      from: { name: 'Bob Miller', email: 'orders@montanaranchfeed.com' },
      to: [{ email: 'support@himalayankoh.com' }],
      subject: 'Re: Wholesale Livestock Salt Inquiry',
      bodyText: 'We received your catalog and are interested in 5 tons of 30lb blocks.',
      authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    });

    const inbound = inboundRes.message;
    expect(inbound.leadId).toBe('lead-montana-77');
    expect(inbound.leadBusinessName).toBe('Montana Ranch Feed');
    expect(inbound.labels).toContain('LeadOS Prospect');

    // Verify lead status was updated to replied
    expect(mockUpdateSavedLead).toHaveBeenCalledWith('lead-montana-77', {
      status: 'replied',
    });

    // Re-delivering the exact same messageId should return existing record idempotently
    const duplicateRes = await recordInboundEmail({
      messageId: '<unique-msg-999@montanaranchfeed.com>',
      mailbox: 'support@himalayankoh.com',
      from: { name: 'Bob Miller', email: 'orders@montanaranchfeed.com' },
      to: [{ email: 'support@himalayankoh.com' }],
      subject: 'Re: Wholesale Livestock Salt Inquiry',
      bodyText: 'Duplicate body',
    });

    expect(duplicateRes.duplicate).toBe(true);
    expect(duplicateRes.message.id).toBe(inbound.id);
  });

  it('records the received copy of our own reply instead of treating it as a duplicate of Sent', async () => {
    const inbound = await recordInboundEmail({
      messageId: '<thread-start-55@admin.himalayankoh.com>',
      mailbox: 'support@himalayankoh.com',
      from: { name: 'Himalayan Koh Administration', email: 'admin@himalayankoh.com' },
      to: [{ email: 'support@himalayankoh.com' }],
      subject: 'Invoice question',
      bodyText: 'Can you confirm this invoice?',
    });

    const reply = await sendInboxMessage({
      replyToMessageId: inbound.message.id,
      mailbox: 'support@himalayankoh.com',
      to: 'admin@himalayankoh.com',
      subject: 'Re: Invoice question',
      bodyText: 'Confirmed.',
    });

    // The same RFC 5322 Message-ID is now delivered back into the recipient mailbox.
    const received = await recordInboundEmail({
      messageId: reply.messageId,
      inReplyTo: '<thread-start-55@admin.himalayankoh.com>',
      mailbox: 'admin@himalayankoh.com',
      from: { name: 'Himalayan Koh Customer Support', email: 'support@himalayankoh.com' },
      to: [{ email: 'admin@himalayankoh.com' }],
      subject: 'Re: Invoice question',
      bodyText: 'Confirmed.',
    });

    expect(received.duplicate).toBe(false);
    expect(received.message.direction).toBe('inbound');
    expect(received.message.mailbox).toBe('admin@himalayankoh.com');
    expect(received.message.id).not.toBe(reply.id);

    const adminState = await listInboxState({ folder: 'admin' });
    expect(adminState.messages).toHaveLength(1);
    expect(adminState.messages[0].subject).toBe('Re: Invoice question');

    // Both the Sent copy and the received copy share the Message-ID and must
    // survive the store's merge rather than collapsing into one record; the
    // counts are computed over every message, so both have to be present.
    expect(adminState.counts.sent).toBe(1);
    expect(adminState.counts.admin).toBe(1);
  });

  it('replaces a stored raw-MIME body when a later sync parses the same message', async () => {
    await recordInboundEmail({
      messageId: '<cpanel-config-101@himalayankoh.com>',
      mailbox: 'admin@himalayankoh.com',
      from: { name: 'cPanel', email: 'cpanel@himalayankoh.com' },
      to: [{ email: 'admin@himalayankoh.com' }],
      subject: 'Client configuration settings',
      bodyText:
        '--mixed-Cpanel::Email::Object-620023-1792387118-0.9\r\nContent-Type: multipart/alternative; boundary="alt"\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nYour settings were saved.',
    });

    const healed = await recordInboundEmail({
      messageId: '<cpanel-config-101@himalayankoh.com>',
      mailbox: 'admin@himalayankoh.com',
      from: { name: 'cPanel', email: 'cpanel@himalayankoh.com' },
      to: [{ email: 'admin@himalayankoh.com' }],
      subject: 'Client configuration settings',
      bodyText: 'Your settings were saved.',
    });

    expect(healed.duplicate).toBe(true);
    expect(healed.message.bodyText).toBe('Your settings were saved.');
    expect(healed.message.snippet).toBe('Your settings were saved.');

    const state = await listInboxState({ folder: 'admin' });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].bodyText).toBe('Your settings were saved.');
  });

  it('a forced refresh re-reads correspondence instead of returning the TTL cache', async () => {
    // The admin's "Check mail" button asks for `sync=true`. That request used to
    // skip the external sync entirely inside the cache window, so new mail never
    // appeared until the cache expired.
    await listInboxState();
    expect(mockLeadosRequest).not.toHaveBeenCalled();

    await listInboxState({ forceSync: true });
    expect(mockLeadosRequest).toHaveBeenCalled();
  });

  it('does NOT mark unrelated email conversations as sales leads', async () => {
    mockListSavedLeads.mockResolvedValue([
      {
        id: 'lead-some-feed',
        businessName: 'Some Feed Store',
        email: 'feed@example.com',
        status: 'contacted',
      },
    ]);

    const personalRes = await recordInboundEmail({
      messageId: '<accounting-report-444@vendor.net>',
      mailbox: 'salman@himalayankoh.com',
      from: { name: 'Acme Accounting', email: 'billing@vendor.net' },
      to: [{ email: 'salman@himalayankoh.com' }],
      subject: 'Monthly Software Subscription Invoice',
      bodyText: 'Your monthly invoice is ready for download.',
    });

    const personalOrVendorEmail = personalRes.message;
    expect(personalOrVendorEmail.leadId).toBeNull();
    expect(personalOrVendorEmail.leadBusinessName).toBeNull();
    expect(personalOrVendorEmail.labels).not.toContain('LeadOS Prospect');
    expect(mockUpdateSavedLead).not.toHaveBeenCalled();
  });
  it('shows actual wholesale messages and counts in the dedicated ws folder', async () => {
    await recordInboundEmail({ messageId: '<internal-ws-folder@test.invalid>', mailbox: 'ws@himalayankoh.com', from: { email: 'owner@test.invalid' }, to: [{ email: 'ws@himalayankoh.com' }], subject: 'Internal inquiry', bodyText: 'A saved inquiry notification.' });
    await recordInboundEmail({ messageId: '<internal-support-folder@test.invalid>', mailbox: 'support@himalayankoh.com', from: { email: 'other@test.invalid' }, to: [{ email: 'support@himalayankoh.com' }], subject: 'Unrelated support', bodyText: 'This belongs to Support.' });
    const state = await listInboxState({ folder: 'ws', skipExternalSync: true });
    expect(state.messages).toHaveLength(1); expect(state.messages[0].subject).toBe('Internal inquiry'); expect(state.counts.ws).toBe(1);
    expect(state.mailboxes.some(m => m.address === 'sales@himalayankoh.com')).toBe(false);
  });

});
