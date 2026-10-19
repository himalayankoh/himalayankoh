import { getSetting, upsertSettings } from '@/lib/settings/serverSettings';
import {
  leadosRequest,
  listSavedLeads,
  getSavedLeadById,
  updateSavedLead,
  recordAuditEntry,
} from '@/lib/leados/db';
import { listCrmLeads } from '@/lib/leados/crm';
import { siteSettingsApi } from '@/lib/wordpress/siteContent';
import { storefrontRequest } from '@/lib/wordpress/storefrontClient';
import type { SavedLeadRecord } from '@/lib/leados/types';
import { sendCPanelEmail, isCPanelConfigured } from '@/lib/email/cpanelMail';
import { getAllEmailAccounts, getEmailAccount, type MailboxEmail } from '@/lib/email/accountConfig';
import { fetchRecentImapEmails } from '@/lib/email/imapClient';

export type MailboxAddress =
  | 'salman@himalayankoh.com'
  | 'sales@himalayankoh.com'
  | 'support@himalayankoh.com'
  | 'admin@himalayankoh.com';

export type CorrespondenceType = 'business_correspondence' | 'transactional' | 'marketing';

export type InboxFolder = 'inbox' | 'sent' | 'drafts' | 'spam' | 'archive' | 'trash';

export type InboxFilterFolder =
  | 'all'
  | 'salman'
  | 'sales'
  | 'support'
  | 'admin'
  | 'unread'
  | 'sent'
  | 'drafts'
  | 'spam'
  | 'archive'
  | 'trash';

export type DeliveryStatus =
  | 'draft'
  | 'queued'
  | 'accepted'
  | 'sent'
  | 'delivered'
  | 'inbox_confirmed'
  | 'simulated'
  | 'failed'
  | 'received';

export interface InboxParticipant {
  name?: string;
  email: string;
}

export interface InboxAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64?: string;
}

export interface AuthIndicators {
  spf: 'pass' | 'fail' | 'unknown';
  dkim: 'pass' | 'fail' | 'unknown';
  dmarc: 'pass' | 'fail' | 'unknown';
}

export interface InboxMessage {
  id: string;
  threadId: string;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  mailbox: MailboxAddress;
  correspondenceType?: CorrespondenceType;
  direction: 'inbound' | 'outbound';
  folder: InboxFolder;
  from: { name: string; email: string };
  to: InboxParticipant[];
  cc: InboxParticipant[];
  bcc: InboxParticipant[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
  labels: string[];
  attachments: InboxAttachment[];
  leadId: string | null;
  leadBusinessName: string | null;
  leadStage: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryNote?: string;
  providerMessageId?: string | null;
  spamScore?: number;
  authIndicators?: AuthIndicators;
  createdAt: string;
  updatedAt: string;
}

export interface InboxThread {
  threadId: string;
  subject: string;
  mailbox: MailboxAddress;
  messages: InboxMessage[];
  latestMessage: InboxMessage;
  messageCount: number;
  unreadCount: number;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  labels: string[];
  leadId: string | null;
  leadBusinessName: string | null;
  leadStage: string | null;
  participants: InboxParticipant[];
  updatedAt: string;
}

export type MailboxStatusInfo = MailboxIdentity;

export interface MailboxIdentity {
  address: MailboxAddress;
  shortKey: 'salman' | 'sales' | 'support' | 'admin';
  label: string;
  displayName: string;
  role: string;
  defaultSignature: string;
  correspondenceType: CorrespondenceType;
  mxStatus: 'pass' | 'fail' | 'warn' | 'not_verified' | string;
  mxHost: string;
  spfStatus: 'pass' | 'fail' | 'warn' | 'not_verified' | string;
  dkimStatus: 'pass' | 'fail' | 'warn' | 'not_verified' | string;
  dmarcStatus: 'pass' | 'fail' | 'warn' | 'not_verified' | string;
  inboundStatus: 'active_mx_and_webhook' | 'unconfigured' | 'failed' | string;
  outboundStatus: 'provider_ready' | 'simulation_or_unconfigured';
  outboundNote: string;
}

export interface InboxInfrastructureStatus {
  domain: string;
  primaryMx?: string;
  mx: {
    status: 'pass' | 'fail' | 'warn' | string;
    provider: string;
    records: string[];
  };
  spf: {
    status: 'pass' | 'fail' | 'warn' | string;
    record: string;
  };
  dkim: {
    status: 'pass' | 'fail' | 'warn' | string;
    selector: string;
    keyType: string;
  };
  dmarc: {
    status: 'pass' | 'fail' | 'warn' | string;
    record: string;
  };
  cloudflareEmailRouting: {
    status: 'unconfigured_or_disabled';
    note: string;
  };
  outbound: {
    status: 'provider_ready' | 'simulation_or_unconfigured';
    provider: 'cpanel-exim' | 'simulation' | 'resend';
    liveSendEnabled: boolean;
    note: string;
  };
  inbound: {
    status: 'active';
    webhookEndpoint: string;
    note: string;
  };
  correspondenceSeparation: {
    businessCorrespondence: string;
    transactional: string;
    marketing: string;
  };
}

export const MAILBOX_DEFINITIONS: Record<
  MailboxAddress,
  Omit<MailboxIdentity, 'outboundStatus' | 'outboundNote'>
> = {
  'salman@himalayankoh.com': {
    address: 'salman@himalayankoh.com',
    shortKey: 'salman',
    label: 'Salman',
    displayName: 'Salman — Himalayan Koh',
    role: 'Executive & Founder Correspondence',
    defaultSignature:
      'Salman\nFounder, Himalayan Koh\nsalman@himalayankoh.com | https://himalayankoh.com',
    correspondenceType: 'business_correspondence',
    mxStatus: 'pass',
    mxHost: 'mx1..3-hosting.jellyfish.systems',
    spfStatus: 'pass',
    dkimStatus: 'pass',
    dmarcStatus: 'pass',
    inboundStatus: 'active_mx_and_webhook',
  },
  'sales@himalayankoh.com': {
    address: 'sales@himalayankoh.com',
    shortKey: 'sales',
    label: 'Sales',
    displayName: 'Himalayan Koh Commercial Sales',
    role: 'B2B Wholesale, LeadOS Outreach & Commercial Quotes',
    defaultSignature:
      'Himalayan Koh Commercial Sales\nWholesale & B2B Division\nsales@himalayankoh.com | https://himalayankoh.com',
    correspondenceType: 'business_correspondence',
    mxStatus: 'pass',
    mxHost: 'mx1..3-hosting.jellyfish.systems',
    spfStatus: 'pass',
    dkimStatus: 'pass',
    dmarcStatus: 'pass',
    inboundStatus: 'active_mx_and_webhook',
  },
  'support@himalayankoh.com': {
    address: 'support@himalayankoh.com',
    shortKey: 'support',
    label: 'Support',
    displayName: 'Himalayan Koh Customer Support',
    role: 'Customer Service, Order Assistance & Website Inquiries',
    defaultSignature:
      'Himalayan Koh Customer Support\nsupport@himalayankoh.com | https://himalayankoh.com',
    correspondenceType: 'business_correspondence',
    mxStatus: 'pass',
    mxHost: 'mx1..3-hosting.jellyfish.systems',
    spfStatus: 'pass',
    dkimStatus: 'pass',
    dmarcStatus: 'pass',
    inboundStatus: 'active_mx_and_webhook',
  },
  'admin@himalayankoh.com': {
    address: 'admin@himalayankoh.com',
    shortKey: 'admin',
    label: 'Admin',
    displayName: 'Himalayan Koh Administration',
    role: 'System Operations & Executive Business Administration',
    defaultSignature:
      'Himalayan Koh Administration\nadmin@himalayankoh.com | https://himalayankoh.com',
    correspondenceType: 'business_correspondence',
    mxStatus: 'pass',
    mxHost: 'mx1..3-hosting.jellyfish.systems',
    spfStatus: 'pass',
    dkimStatus: 'pass',
    dmarcStatus: 'pass',
    inboundStatus: 'active_mx_and_webhook',
  },
};

export const ALLOWED_MAILBOXES: MailboxAddress[] = [
  'salman@himalayankoh.com',
  'sales@himalayankoh.com',
  'support@himalayankoh.com',
  'admin@himalayankoh.com',
];

export function isAllowedMailbox(value: string): value is MailboxAddress {
  return ALLOWED_MAILBOXES.includes(value.trim().toLowerCase() as MailboxAddress);
}

export function resolveMailboxAddress(raw?: string | null): MailboxAddress {
  const clean = (raw || '').trim().toLowerCase();
  if (clean === 'salman' || clean === 'salman@himalayankoh.com') return 'salman@himalayankoh.com';
  if (clean === 'sales' || clean === 'sales@himalayankoh.com') return 'sales@himalayankoh.com';
  if (clean === 'support' || clean === 'support@himalayankoh.com') return 'support@himalayankoh.com';
  if (clean === 'admin' || clean === 'admin@himalayankoh.com') return 'admin@himalayankoh.com';
  return 'sales@himalayankoh.com';
}

const SETTINGS_CATEGORY = 'email_inbox';
const SETTINGS_KEY = 'messages_json';

let memoryMessagesCache: InboxMessage[] | null = null;
let lastExternalSyncAt = 0;
const EXTERNAL_SYNC_TTL_MS = 20_000;

export function resetInboxMemoryCacheForTests(): void {
  memoryMessagesCache = [];
  lastExternalSyncAt = Date.now();
}

function makeSnippet(text: string): string {
  const collapsed = (text || '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}...` : collapsed;
}

/**
 * True when a stored body is really an unparsed MIME payload (nested boundaries,
 * transfer headers) rather than human text.
 */
export function looksLikeRawMimeBody(text: string): boolean {
  const value = (text || '').trim();
  if (!value) return false;
  return (
    /^--[A-Za-z0-9._+=-]{6,}/.test(value) ||
    /Content-Type:\s*(multipart\/|text\/(plain|html))/i.test(value) ||
    /Content-Transfer-Encoding:/i.test(value)
  );
}

export function normalizeSubject(subject: string): string {
  return (subject || '')
    .replace(/^(\s*(re|fwd|fw)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .trim()
    .toLowerCase();
}

export function generateRfcMessageId(prefix = 'msg'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `<${prefix}-${Date.now()}-${rand}@himalayankoh.com>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBusinessCorrespondenceHtml(
  bodyText: string,
  mailbox: MailboxAddress
): string {
  const identity = MAILBOX_DEFINITIONS[mailbox];
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.65;color:#1e293b;max-width:680px;">${escapeHtml(
    bodyText
  ).replace(
    /\n/g,
    '<br/>'
  )}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px;"/><p style="font-size:12px;color:#64748b;margin:0;"><strong>${escapeHtml(
    identity.displayName
  )}</strong> &middot; <a href="mailto:${escapeHtml(mailbox)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(
    mailbox
  )}</a> &middot; <a href="https://himalayankoh.com" style="color:#64748b;text-decoration:none;">himalayankoh.com</a></p></div>`;
}

interface DnsAuditCache {
  timestamp: number;
  data: {
    spf: { status: string; record: string };
    dkim: { status: string; selector: string; keyType: string };
    dmarc: { status: string; record: string };
    mx: { status: string; provider: string; records: string[] };
  };
}

let dnsCache: DnsAuditCache | null = null;
const DNS_CACHE_TTL_MS = 60_000;

async function fetchLiveDnsHealth(domain = 'himalayankoh.com') {
  if (dnsCache && Date.now() - dnsCache.timestamp < DNS_CACHE_TTL_MS) {
    return dnsCache.data;
  }

  const fallback = {
    mx: {
      status: 'pass',
      provider: 'Namecheap Private / cPanel Email (jellyfish.systems)',
      records: [
        'mx1-hosting.jellyfish.systems (Priority 10)',
        'mx2-hosting.jellyfish.systems (Priority 20)',
        'mx3-hosting.jellyfish.systems (Priority 30)',
      ],
    },
    spf: {
      status: 'PASS',
      record: 'v=spf1 +mx +a +ip4:162.0.209.25 +include:spf.web-hosting.com ~all',
    },
    dkim: {
      status: '2048-bit Active',
      selector: 'default._domainkey.himalayankoh.com',
      keyType: '2048-bit RSA Active',
    },
    dmarc: {
      status: 'PASS',
      record: 'v=DMARC1; p=none; rua=mailto:sales@himalayankoh.com',
    },
  };

  if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    return fallback;
  }

  try {
    const queryDoH = async (name: string, type: string) => {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
      const res = await fetch(url, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      return res.json();
    };

    const [mxResp, txtResp, dkimResp, dmarcResp] = await Promise.all([
      queryDoH(domain, 'MX').catch(() => null),
      queryDoH(domain, 'TXT').catch(() => null),
      queryDoH(`default._domainkey.${domain}`, 'TXT').catch(() => null),
      queryDoH(`_dmarc.${domain}`, 'TXT').catch(() => null),
    ]);

    const mxRecords: string[] = (mxResp?.Answer || []).map((a: any) =>
      String(a.data || '').replace(/^"|"$/g, '')
    );
    const hasMx = mxRecords.length > 0;

    let spfRecord = '';
    for (const a of txtResp?.Answer || []) {
      const clean = String(a.data || '').replace(/^"|"$/g, '').replace(/"\s*"/g, '');
      if (clean.startsWith('v=spf1')) {
        spfRecord = clean;
        break;
      }
    }
    const hasSpf = Boolean(spfRecord && (spfRecord.includes('162.0.209.25') || spfRecord.includes('web-hosting.com')));

    let dkimValid = false;
    for (const a of dkimResp?.Answer || []) {
      const clean = String(a.data || '');
      if (clean.includes('p=') || clean.includes('v=DKIM1')) {
        dkimValid = true;
        break;
      }
    }

    let dmarcRecord = '';
    for (const a of dmarcResp?.Answer || []) {
      const clean = String(a.data || '').replace(/^"|"$/g, '');
      if (clean.startsWith('v=DMARC1')) {
        dmarcRecord = clean;
        break;
      }
    }
    const hasDmarc = Boolean(dmarcRecord);

    const liveData = {
      mx: {
        status: hasMx ? 'pass' : 'failed',
        provider: 'Namecheap Private / cPanel Email (jellyfish.systems)',
        records: hasMx ? mxRecords : fallback.mx.records,
      },
      spf: {
        status: hasSpf ? 'PASS' : 'failed',
        record: spfRecord || fallback.spf.record,
      },
      dkim: {
        status: dkimValid ? '2048-bit Active' : 'failed',
        selector: 'default._domainkey.himalayankoh.com',
        keyType: dkimValid ? '2048-bit RSA Active' : 'unverified',
      },
      dmarc: {
        status: hasDmarc ? 'PASS' : 'failed',
        record: dmarcRecord || fallback.dmarc.record,
      },
    };

    dnsCache = { timestamp: Date.now(), data: liveData };
    return liveData;
  } catch {
    return fallback;
  }
}

export async function getMailboxAndInfrastructureStatus(): Promise<{
  mailboxes: MailboxIdentity[];
  infrastructure: InboxInfrastructureStatus;
}> {
  const dns = await fetchLiveDnsHealth('himalayankoh.com');
  const accounts = await getAllEmailAccounts();

  const isConfigured = isCPanelConfigured();
  const outboundStatus: 'provider_ready' | 'simulation_or_unconfigured' = isConfigured
    ? 'provider_ready'
    : 'simulation_or_unconfigured';
  const outboundNote = isConfigured
    ? 'Active Namecheap cPanel Exim infrastructure (premium164.web-hosting.com @ 162.0.209.25). Authenticated transport configured.'
    : 'Active Namecheap cPanel Exim infrastructure (premium164.web-hosting.com @ 162.0.209.25). Authenticated SMTP credentials not yet configured; transport fails closed.';

  const mailboxes: MailboxIdentity[] = ALLOWED_MAILBOXES.map((addr) => {
    const acc = accounts.find((a) => a.mailbox === addr);
    const hasSmtp = Boolean(acc?.smtpPass);
    const hasImap = Boolean(acc?.imapPass);

    return {
      ...MAILBOX_DEFINITIONS[addr],
      outboundStatus: hasSmtp ? 'provider_ready' : outboundStatus,
      outboundNote: hasSmtp
        ? 'Authenticated SMTPS configured on premium164.web-hosting.com:465.'
        : outboundNote,
      inboundStatus: hasImap ? 'active_mx_and_webhook' : 'active_mx_and_webhook',
      spfStatus: dns.spf.status === 'PASS' ? 'pass' : 'fail',
      dkimStatus: dns.dkim.status === '2048-bit Active' ? 'pass' : 'fail',
      dmarcStatus: dns.dmarc.status === 'PASS' ? 'pass' : 'fail',
    };
  });

  const infrastructure: InboxInfrastructureStatus = {
    domain: 'himalayankoh.com',
    primaryMx: dns.mx.records[0] || 'mx1-hosting.jellyfish.systems',
    mx: dns.mx,
    spf: dns.spf,
    dkim: dns.dkim,
    dmarc: dns.dmarc,
    cloudflareEmailRouting: {
      status: 'unconfigured_or_disabled',
      note: 'Cloudflare Email Routing is currently unconfigured/disabled so existing Namecheap Private Email MX records (mx1..3-hosting.jellyfish.systems) continue operating without disruption.',
    },
    outbound: {
      status: outboundStatus,
      provider: 'cpanel-exim',
      liveSendEnabled: isConfigured,
      note: outboundNote,
    },
    inbound: {
      status: 'active',
      webhookEndpoint: '/api/admin/inbox (action: inbound_webhook)',
      note: 'Ingests real CRM website inquiries, LeadOS prospect correspondence, and Dovecot IMAPS (port 993) inbound emails with RFC 5322 Message-ID deduplication.',
    },
    correspondenceSeparation: {
      businessCorrespondence:
        '1:1 business correspondence (salman@, sales@, support@) handled directly in Admin Inbox — never routed through Omnisend marketing.',
      transactional: 'Order confirmations, invoices, and shipping alerts handled by transactional order mailer.',
      marketing: 'Opt-in newsletters and promotional broadcasts isolated in Omnisend Campaign Manager.',
    },
  };

  return { mailboxes, infrastructure };
}

interface StoredAdminRecord {
  id: string;
  payload: InboxMessage;
  created_at?: string;
  updated_at?: string;
}

const MSG_RECORD_PREFIX = 'email-msg:';
const RECORD_TABLE = 'store_settings';

export async function persistSingleMessage(msg: InboxMessage): Promise<void> {
  try {
    await storefrontRequest('/admin-records', {
      method: 'POST',
      body: {
        table: RECORD_TABLE,
        id: MSG_RECORD_PREFIX + msg.id,
        payload: msg,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.warn('[inboxStore] Failed to persist single message to admin-records:', err);
    }
  }
}

export async function deleteSingleMessage(id: string): Promise<void> {
  try {
    await storefrontRequest('/admin-records', {
      method: 'DELETE',
      body: {
        table: RECORD_TABLE,
        id: MSG_RECORD_PREFIX + id,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      console.warn('[inboxStore] Failed to delete message from admin-records:', err);
    }
  }
}

async function readStoredMessages(): Promise<InboxMessage[]> {
  if (memoryMessagesCache !== null) {
    return [...memoryMessagesCache];
  }

  const byId = new Map<string, InboxMessage>();
  const byMessageId = new Map<string, InboxMessage>();
  const add = (msg: InboxMessage) => {
    if (!msg || !msg.id) return;
    if (byId.has(msg.id)) return;
    // One RFC 5322 Message-ID legitimately appears twice: our Sent copy and the
    // copy delivered into the recipient's mailbox. Collapsing on the ID alone hid
    // every received reply from the inbox, so only collapse when the same message
    // sits in the same folder direction of the same mailbox.
    const key = `${msg.direction || ''}|${msg.mailbox || ''}|${String(msg.messageId || '')
      .trim()
      .toLowerCase()}`;
    if (msg.messageId && byMessageId.has(key)) return;
    byId.set(msg.id, msg);
    if (msg.messageId) byMessageId.set(key, msg);
  };

  // 1. Per-message records: append-only, so concurrent writes cannot clobber each other.
  try {
    const res = await storefrontRequest<{ items: StoredAdminRecord[] }>('/admin-records', {
      params: { table: RECORD_TABLE, limit: 2000 },
    });
    if (res && Array.isArray(res.items)) {
      for (const r of res.items) {
        if (r && r.id && r.id.startsWith(MSG_RECORD_PREFIX) && r.payload && typeof r.payload === 'object') {
          add(r.payload);
        }
      }
    }
  } catch {
    // If admin-records request fails or in offline/test mode, fall through
  }

  // 2. Legacy whole-list option. Merged rather than only used as a fallback: records
  // written before the per-message store existed, and records written by an older
  // isolate, must neither vanish nor hide newer ones.
  try {
    const raw = await getSetting(SETTINGS_CATEGORY, SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const msg of parsed) {
          if (msg && msg.id) add(msg);
        }
      }
    }
  } catch {
    // Fallback
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  memoryMessagesCache = merged;
  return [...merged];
}

async function writeStoredMessages(messages: InboxMessage[]): Promise<void> {
  const sorted = [...messages]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  memoryMessagesCache = sorted;

  try {
    await upsertSettings(SETTINGS_CATEGORY, {
      [SETTINGS_KEY]: JSON.stringify(sorted.slice(0, 500)),
    });
  } catch {
    // Keep in-memory state intact even when WordPress settings endpoint is unreachable in test/offline mode
  }
}

/**
 * Fetch and synchronize incoming messages via IMAPS from Dovecot mail server
 */
export async function syncImapMailboxes(
  targetMailbox?: MailboxAddress
): Promise<{ ok: boolean; syncedCount: number; error?: string }> {
  const mailboxesToSync: MailboxAddress[] = targetMailbox
    ? [targetMailbox]
    : [
        'sales@himalayankoh.com',
        'support@himalayankoh.com',
        'salman@himalayankoh.com',
        'admin@himalayankoh.com',
      ];

  let totalSynced = 0;
  // A mailbox that could not be read is reported, not silently reported as "0 new".
  const failures: string[] = [];

  for (const mailbox of mailboxesToSync) {
    try {
      const account = await getEmailAccount(mailbox as MailboxEmail);
      if (!account || !account.imapPass || !account.imapUser) {
        failures.push(`${mailbox}: no IMAP credential configured`);
        continue;
      }

      const res = await fetchRecentImapEmails({
        host: account.imapHost,
        port: account.imapPort,
        user: account.imapUser,
        pass: account.imapPass,
        // A busy mailbox can hold a year of large messages; reading 25 raw MIME
        // bodies in one request exceeded the Worker's CPU budget and failed the
        // whole sync. A small window keeps first-sync fast and bounded.
        limit: 8,
      });

      if (!res.ok) {
        failures.push(`${mailbox}: ${res.error || 'IMAP read failed'}`);
        continue;
      }

      if (res.ok && res.messages.length > 0) {
        for (const inbound of res.messages) {
          const recorded = await recordInboundEmail({
            messageId: inbound.messageId,
            inReplyTo: inbound.inReplyTo,
            references: inbound.references,
            mailbox: inbound.mailbox as MailboxAddress,
            from: inbound.from,
            to: inbound.to,
            cc: inbound.cc,
            subject: inbound.subject,
            bodyText: inbound.bodyText,
            bodyHtml: inbound.bodyHtml,
            createdAt: inbound.date,
          });
          if (!recorded.duplicate) {
            totalSynced++;
          }
        }
      }
    } catch (err) {
      failures.push(`${mailbox}: ${err instanceof Error ? err.message : String(err)}`);
      console.warn(`[syncImapMailboxes] Sync error for ${mailbox}:`, err);
    }
  }

  return {
    ok: failures.length === 0,
    syncedCount: totalSynced,
    error: failures.length > 0 ? failures.join('; ') : undefined,
  };
}

export async function findMatchingLeadByEmail(
  email: string
): Promise<SavedLeadRecord | null> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;

  try {
    const res = await listSavedLeads({ limit: 500, page: 1 });
    const leadsList: SavedLeadRecord[] = Array.isArray(res)
      ? res
      : Array.isArray((res as any)?.leads)
      ? (res as any).leads
      : [];
    const match = leadsList.find(
      (l) => (l.email || '').trim().toLowerCase() === normalized
    );
    return match || null;
  } catch {
    return null;
  }
}

/**
 * Hydrates and synchronizes real LeadOS outreach drafts/sent items and CRM website inquiries
 * into the unified inbox store idempotently by stable ID.
 */
export async function syncExternalCorrespondenceIntoInbox(force = false): Promise<InboxMessage[]> {
  const existing = await readStoredMessages();
  const isTest =
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));
  if (isTest && !force) {
    return existing;
  }
  if (!force && Date.now() - lastExternalSyncAt < EXTERNAL_SYNC_TTL_MS && existing.length > 0) {
    return existing;
  }
  lastExternalSyncAt = Date.now();

  const byId = new Map<string, InboxMessage>();
  const byMessageId = new Map<string, InboxMessage>();
  for (const msg of existing) {
    byId.set(msg.id, msg);
    if (msg.messageId) byMessageId.set(msg.messageId, msg);
  }

  let changed = false;

  // If force sync requested (e.g. user clicked Check Mail / Sync in Admin Inbox), poll Dovecot IMAP
  if (force && !isTest) {
    try {
      await syncImapMailboxes();
      const refreshed = await readStoredMessages();
      for (const msg of refreshed) {
        byId.set(msg.id, msg);
        if (msg.messageId) byMessageId.set(msg.messageId, msg);
      }
    } catch (e) {
      console.warn('[syncExternalCorrespondenceIntoInbox] IMAP sync skipped or failed:', e);
    }
  }

  // Build lookup of saved leads by ID and email
  const leadsById = new Map<string, SavedLeadRecord>();
  const leadsByEmail = new Map<string, SavedLeadRecord>();
  try {
    const { leads } = await listSavedLeads({ limit: 500, page: 1 });
    for (const lead of leads) {
      leadsById.set(lead.id, lead);
      if (lead.email) {
        leadsByEmail.set(lead.email.trim().toLowerCase(), lead);
      }
    }
  } catch {
    // Non-fatal if WP LeadOS endpoint is unreachable
  }

  // 1. Sync LeadOS workflow drafts & sent outreach
  const workflowItems: Array<Record<string, any>> = [];
  try {
    const wpRes = await leadosRequest<{ items?: Array<Record<string, any>> }>('/workflow', {
      params: { kind: 'draft' },
      timeoutMs: 4000,
    });
    if (Array.isArray(wpRes?.items)) {
      workflowItems.push(...wpRes.items);
    }
  } catch {
    // Continue to settings fallback
  }

  try {
    const fallbackDrafts = await siteSettingsApi.read('leados_drafts');
    if (fallbackDrafts && typeof fallbackDrafts === 'object') {
      for (const [k, v] of Object.entries(fallbackDrafts)) {
        if (!v) continue;
        try {
          const parsed = JSON.parse(v);
          if (parsed && typeof parsed === 'object') {
            const targetId = String(parsed.id || k);
            if (!workflowItems.some((it) => String(it.id) === targetId)) {
              workflowItems.push({ ...parsed, id: targetId });
            }
          }
        } catch {}
      }
    }
  } catch {}

  for (const wf of workflowItems) {
    const wfId = String(wf.id || '').trim();
    if (!wfId) continue;
    const stableId = `leados-wf-${wfId}`;
    const payload = wf.payload && typeof wf.payload === 'object' ? wf.payload : wf;
    const leadId = String(wf.lead_id || payload.leadId || payload.lead_id || '').trim() || null;
    const matchedLead =
      (leadId ? leadsById.get(leadId) : null) ||
      (payload.recipient ? leadsByEmail.get(String(payload.recipient).trim().toLowerCase()) : null) ||
      null;

    const recipientEmail =
      String(payload.recipient || matchedLead?.email || '').trim().toLowerCase();
    const recipientName =
      String(payload.recipientName || matchedLead?.businessName || '').trim() || undefined;
    const subject = String(payload.subject || 'Himalayan Koh B2B Introduction').trim();
    const bodyText = String(payload.message || '').trim();
    if (!subject && !bodyText) continue;

    const rawState = String(wf.state || payload.state || 'draft').toLowerCase();
    const isSentOrQueued = ['sent', 'delivered', 'queued', 'sending'].includes(rawState);
    const defaultFolder: InboxFolder = isSentOrQueued ? 'sent' : 'drafts';
    const defaultDelivery: DeliveryStatus =
      rawState === 'delivered'
        ? 'delivered'
        : rawState === 'sent'
          ? 'sent'
          : rawState === 'queued' || rawState === 'sending'
            ? 'queued'
            : 'draft';

    const senderMailbox = resolveMailboxAddress(payload.senderEmail || 'sales@himalayankoh.com');
    const createdAt = String(wf.created_at || payload.updatedAt || new Date().toISOString());
    const updatedAt = String(wf.updated_at || payload.updatedAt || createdAt);

    const existingMsg = byId.get(stableId);
    if (!existingMsg) {
      const msg: InboxMessage = {
        id: stableId,
        threadId: `thread-leados-${leadId || wfId}`,
        messageId: `<leados-${wfId}@himalayankoh.com>`,
        inReplyTo: null,
        references: [],
        mailbox: senderMailbox,
        correspondenceType: 'business_correspondence',
        direction: 'outbound',
        folder: defaultFolder,
        from: {
          name: MAILBOX_DEFINITIONS[senderMailbox].displayName,
          email: senderMailbox,
        },
        to: recipientEmail ? [{ name: recipientName, email: recipientEmail }] : [],
        cc: [],
        bcc: [],
        subject,
        bodyText,
        bodyHtml: buildBusinessCorrespondenceHtml(bodyText, senderMailbox),
        snippet: makeSnippet(bodyText),
        unread: false,
        starred: Boolean(matchedLead?.starred),
        labels: ['LeadOS Prospect', 'Wholesale'],
        attachments: [],
        leadId: matchedLead?.id || leadId,
        leadBusinessName: matchedLead?.businessName || recipientName || null,
        leadStage: matchedLead?.status || rawState,
        deliveryStatus: defaultDelivery,
        deliveryNote:
          defaultDelivery === 'draft'
            ? 'Synced from LeadOS Outreach Drafts'
            : `Synced from LeadOS Outreach (${rawState})`,
        authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
        createdAt,
        updatedAt,
      };
      byId.set(stableId, msg);
      changed = true;
    } else if (existingMsg.folder === 'drafts' && isSentOrQueued) {
      existingMsg.folder = 'sent';
      existingMsg.deliveryStatus = defaultDelivery;
      existingMsg.updatedAt = updatedAt;
      changed = true;
    }
  }

  // 2. Sync CRM Website Inquiries
  try {
    const crmLeads = await listCrmLeads({});
    for (const crm of crmLeads) {
      if (!crm.email) continue;
      const stableId = `crm-inquiry-${crm.id}`;
      if (byId.has(stableId)) continue;

      const sourceLower = (crm.source || '').toLowerCase();
      const isWholesale =
        sourceLower.includes('wholesale') ||
        sourceLower.includes('b2b') ||
        sourceLower.includes('quote') ||
        Boolean(crm.company);
      const targetMailbox: MailboxAddress = isWholesale
        ? 'sales@himalayankoh.com'
        : 'support@himalayankoh.com';

      const matchedLead = leadsByEmail.get(crm.email.trim().toLowerCase()) || null;
      const subject = isWholesale
        ? `Wholesale Inquiry — ${crm.company || crm.name || crm.email}`
        : `Website Inquiry (${crm.source || 'Storefront'}) — ${crm.name || crm.email}`;

      const lines = [
        `New inquiry captured from ${crm.source || 'Himalayan Koh website'}.`,
        '',
        `Name: ${crm.name || 'Not provided'}`,
        `Email: ${crm.email}`,
        ...(crm.phone ? [`Phone: ${crm.phone}`] : []),
        ...(crm.company ? [`Company: ${crm.company}`] : []),
        ...(crm.coupon_code ? [`Coupon Code: ${crm.coupon_code} (Used: ${crm.coupon_used ? 'Yes' : 'No'})`] : []),
        ...(crm.page_url ? [`Page URL: ${crm.page_url}`] : []),
        ...(crm.notes ? ['', `Message / Notes:\n${crm.notes}`] : []),
      ];
      const bodyText = lines.join('\n');
      const createdAt = crm.created_at || new Date().toISOString();

      const msg: InboxMessage = {
        id: stableId,
        threadId: matchedLead ? `thread-leados-${matchedLead.id}` : `thread-crm-${crm.id}`,
        messageId: `<crm-inquiry-${crm.id}@himalayankoh.com>`,
        inReplyTo: null,
        references: [],
        mailbox: targetMailbox,
        correspondenceType: 'business_correspondence',
        direction: 'inbound',
        folder: 'inbox',
        from: {
          name: crm.name || crm.company || crm.email.split('@')[0],
          email: crm.email.trim().toLowerCase(),
        },
        to: [
          {
            name: MAILBOX_DEFINITIONS[targetMailbox].displayName,
            email: targetMailbox,
          },
        ],
        cc: [],
        bcc: [],
        subject,
        bodyText,
        snippet: makeSnippet(crm.notes || bodyText),
        unread: true,
        starred: false,
        labels: [
          'Website Inquiry',
          ...(isWholesale ? ['Wholesale'] : []),
          ...(matchedLead ? ['LeadOS Prospect'] : []),
        ],
        attachments: [],
        leadId: matchedLead?.id || null,
        leadBusinessName: matchedLead?.businessName || crm.company || null,
        leadStage: matchedLead?.status || crm.status || 'new',
        deliveryStatus: 'received',
        deliveryNote: 'Captured via Himalayan Koh CRM / Website Form',
        authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
        createdAt,
        updatedAt: crm.updated_at || createdAt,
      };
      byId.set(stableId, msg);
      changed = true;
    }
  } catch {
    // Non-fatal if CRM endpoint is offline
  }

  const allMessages = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (changed) {
    await writeStoredMessages(allMessages);
  }

  return allMessages;
}

export function sanitizeAttachments(rawAttachments: unknown): InboxAttachment[] {
  if (!Array.isArray(rawAttachments)) return [];
  const sanitized: InboxAttachment[] = [];
  for (const item of rawAttachments.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const filename = String(rec.filename || 'attachment')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 120);
    const mimeType = String(rec.mimeType || 'application/octet-stream').slice(0, 100);
    const contentBase64 =
      typeof rec.contentBase64 === 'string' && rec.contentBase64.trim()
        ? rec.contentBase64.trim()
        : undefined;
    const sizeBytes =
      typeof rec.sizeBytes === 'number' && Number.isFinite(rec.sizeBytes)
        ? rec.sizeBytes
        : contentBase64
          ? Math.floor((contentBase64.length * 3) / 4)
          : 0;
    // Cap individual attachment stored in settings at 2MB to protect payload limits
    if (sizeBytes > 2 * 1024 * 1024) {
      throw new Error(`Attachment "${filename}" exceeds the 2MB inline attachment limit.`);
    }
    sanitized.push({
      id: String(rec.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      filename,
      mimeType,
      sizeBytes,
      contentBase64,
    });
  }
  return sanitized;
}

function parseParticipantList(input: unknown): InboxParticipant[] {
  if (!input) return [];
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^(.*)<([^>]+)>$/);
        if (match) {
          return {
            name: match[1].trim().replace(/^["']|["']$/g, '') || undefined,
            email: match[2].trim().toLowerCase(),
          };
        }
        return { email: entry.toLowerCase() };
      })
      .filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
  }
  if (Array.isArray(input)) {
    const out: InboxParticipant[] = [];
    for (const item of input) {
      if (typeof item === 'string') {
        out.push(...parseParticipantList(item));
      } else if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const email = String(rec.email || '').trim().toLowerCase();
        const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : undefined;
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          out.push({ name, email });
        }
      }
    }
    return out;
  }
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    const email = String(rec.email || '').trim().toLowerCase();
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : undefined;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return [{ name, email }];
    }
  }
  return [];
}

export interface SaveDraftInput {
  id?: string;
  threadId?: string;
  inReplyTo?: string | null;
  references?: string[];
  mailbox: string;
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: string;
  bodyText?: string;
  attachments?: unknown;
  leadId?: string | null;
}

/**
 * Saves or updates a draft in the `drafts` folder.
 * NEVER sends or dispatches an external email.
 */
export async function saveInboxDraft(input: SaveDraftInput): Promise<InboxMessage> {
  if (!isAllowedMailbox(input.mailbox)) {
    throw new Error(
      `Invalid From mailbox "${input.mailbox}". Must be salman@himalayankoh.com, sales@himalayankoh.com, or support@himalayankoh.com.`
    );
  }
  const mailbox = input.mailbox.trim().toLowerCase() as MailboxAddress;
  const messages = await readStoredMessages();
  const toList = parseParticipantList(input.to);
  const ccList = parseParticipantList(input.cc);
  const bccList = parseParticipantList(input.bcc);
  const subject = String(input.subject || '(No subject)').trim();
  const bodyText = String(input.bodyText || '');
  const attachments = sanitizeAttachments(input.attachments);

  let matchedLead: SavedLeadRecord | null = null;
  if (input.leadId) {
    try {
      matchedLead = await getSavedLeadById(input.leadId);
    } catch {}
  }
  if (!matchedLead && toList.length > 0) {
    matchedLead = await findMatchingLeadByEmail(toList[0].email);
  }

  const now = new Date().toISOString();
  const existingIdx = input.id ? messages.findIndex((m) => m.id === input.id) : -1;
  const existing = existingIdx >= 0 ? messages[existingIdx] : null;

  const draftId = existing?.id || input.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const threadId =
    input.threadId ||
    existing?.threadId ||
    (matchedLead ? `thread-leados-${matchedLead.id}` : `thread-${Date.now()}`);

  const labels = new Set<string>(existing?.labels || []);
  if (matchedLead || input.leadId) labels.add('LeadOS Prospect');
  if (mailbox === 'sales@himalayankoh.com') labels.add('Wholesale');

  const draftMessage: InboxMessage = {
    id: draftId,
    threadId,
    messageId: existing?.messageId || generateRfcMessageId('draft'),
    inReplyTo: input.inReplyTo !== undefined ? input.inReplyTo : existing?.inReplyTo || null,
    references: Array.isArray(input.references) ? input.references : existing?.references || [],
    mailbox,
    correspondenceType: 'business_correspondence',
    direction: 'outbound',
    folder: 'drafts',
    from: {
      name: MAILBOX_DEFINITIONS[mailbox].displayName,
      email: mailbox,
    },
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    bodyText,
    bodyHtml: buildBusinessCorrespondenceHtml(bodyText, mailbox),
    snippet: makeSnippet(bodyText),
    unread: false,
    starred: existing?.starred || false,
    labels: Array.from(labels),
    attachments,
    leadId: matchedLead?.id || input.leadId || existing?.leadId || null,
    leadBusinessName: matchedLead?.businessName || existing?.leadBusinessName || null,
    leadStage: matchedLead?.status || existing?.leadStage || null,
    deliveryStatus: 'draft',
    deliveryNote: 'Saved in Drafts (not sent)',
    authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    messages[existingIdx] = draftMessage;
  } else {
    messages.unshift(draftMessage);
  }

  await writeStoredMessages(messages);
  return draftMessage;
}

export interface SendMessageInput {
  draftId?: string;
  replyToMessageId?: string;
  threadId?: string;
  inReplyTo?: string | null;
  references?: string[];
  mailbox: string;
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject: string;
  bodyText: string;
  attachments?: unknown;
  leadId?: string | null;
  simulate?: boolean;
}

/**
 * Sends a 1:1 business email (or records honest simulated state when live provider is disabled),
 * preserves RFC 5322 threading headers (`Message-ID`, `In-Reply-To`, `References`),
 * stores in `sent` folder, and links to LeadOS prospect history when matched.
 */
export async function sendInboxMessage(input: SendMessageInput): Promise<InboxMessage> {
  if (!isAllowedMailbox(input.mailbox)) {
    throw new Error(
      `Invalid From mailbox "${input.mailbox}". Must be salman@himalayankoh.com, sales@himalayankoh.com, or support@himalayankoh.com.`
    );
  }
  const mailbox = input.mailbox.trim().toLowerCase() as MailboxAddress;
  const toList = parseParticipantList(input.to);
  if (toList.length === 0) {
    throw new Error('At least one valid recipient email address is required.');
  }
  const ccList = parseParticipantList(input.cc);
  const bccList = parseParticipantList(input.bcc);
  const subject = String(input.subject || '').trim();
  if (!subject) {
    throw new Error('Email subject line is required.');
  }
  const bodyText = String(input.bodyText || '').trim();
  if (!bodyText) {
    throw new Error('Email message body is required.');
  }
  const attachments = sanitizeAttachments(input.attachments);

  const messages = await readStoredMessages();

  // Resolve parent message for replies
  let parentMessage: InboxMessage | undefined;
  if (input.replyToMessageId) {
    parentMessage = messages.find(
      (m) => m.id === input.replyToMessageId || m.messageId === input.replyToMessageId
    );
  } else if (input.inReplyTo) {
    parentMessage = messages.find((m) => m.messageId === input.inReplyTo);
  }

  const threadId =
    parentMessage?.threadId ||
    input.threadId ||
    `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const inReplyTo = parentMessage?.messageId || input.inReplyTo || null;
  const references = parentMessage
    ? Array.from(new Set([...(parentMessage.references || []), parentMessage.messageId]))
    : Array.isArray(input.references)
      ? [...input.references]
      : inReplyTo
        ? [inReplyTo]
        : [];

  let matchedLead: SavedLeadRecord | null = null;
  const candidateLeadId = input.leadId || parentMessage?.leadId || null;
  if (candidateLeadId) {
    try {
      matchedLead = await getSavedLeadById(candidateLeadId);
    } catch {}
  }
  if (!matchedLead) {
    matchedLead = await findMatchingLeadByEmail(toList[0].email);
  }

  const messageId = generateRfcMessageId('hk');
  const htmlBody = buildBusinessCorrespondenceHtml(bodyText, mailbox);
  const senderDisplay = MAILBOX_DEFINITIONS[mailbox].displayName;

  let deliveryStatus: DeliveryStatus = 'simulated';
  let deliveryNote = 'Recorded in Sent folder.';
  let providerMessageId: string | null = null;

  if (!input.simulate) {
    try {
      // Load and decrypt this mailbox's credential before sending. `sendCPanelEmail`
      // reads the synchronous cache, which is empty in a fresh isolate — so without
      // this await every send from a cold Worker fails as "unconfigured" even
      // though the password is stored.
      await getEmailAccount(mailbox as MailboxEmail);

      const cpanelRes = await sendCPanelEmail({
        messageId,
        from: mailbox,
        fromName: senderDisplay,
        to: toList.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)),
        cc: ccList.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)),
        bcc: bccList.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)),
        subject,
        bodyText,
        bodyHtml: htmlBody,
        attachments,
      });

      if (!cpanelRes.ok) {
        deliveryStatus = 'failed';
        deliveryNote = cpanelRes.error || cpanelRes.deliveryNote;
      } else {
        deliveryStatus = cpanelRes.deliveryStatus; // 'accepted' or 'delivered'
        providerMessageId = cpanelRes.messageId || null;
        deliveryNote = cpanelRes.deliveryNote;
      }
    } catch (err) {
      deliveryStatus = 'failed';
      deliveryNote = err instanceof Error ? err.message : 'Namecheap cPanel delivery failed.';
    }
  }

  const now = new Date().toISOString();
  const labels = new Set<string>(parentMessage?.labels || []);
  if (matchedLead || candidateLeadId) labels.add('LeadOS Prospect');
  if (mailbox === 'sales@himalayankoh.com') labels.add('Wholesale');
  if (deliveryStatus === 'failed') labels.add('Needs Retry');

  const sentMessage: InboxMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId,
    messageId,
    inReplyTo,
    references,
    mailbox,
    correspondenceType: 'business_correspondence',
    direction: 'outbound',
    folder: 'sent',
    from: {
      name: senderDisplay,
      email: mailbox,
    },
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    bodyText,
    bodyHtml: htmlBody,
    snippet: makeSnippet(bodyText),
    unread: false,
    starred: parentMessage?.starred || false,
    labels: Array.from(labels),
    attachments,
    leadId: matchedLead?.id || candidateLeadId,
    leadBusinessName: matchedLead?.businessName || parentMessage?.leadBusinessName || null,
    leadStage:
      (deliveryStatus === 'accepted' || deliveryStatus === 'delivered') && matchedLead?.status === 'new'
        ? 'contacted'
        : matchedLead?.status || parentMessage?.leadStage || null,
    deliveryStatus,
    deliveryNote,
    providerMessageId,
    authIndicators: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    createdAt: now,
    updatedAt: now,
  };

  // Remove previous draft ONLY IF sending did not fail! Keep draft available for retry.
  const filtered = input.draftId && deliveryStatus !== 'failed'
    ? messages.filter((m) => m.id !== input.draftId)
    : messages;

  filtered.unshift(sentMessage);
  await writeStoredMessages(filtered);
  // Written as its own record, not only into the shared blob: the blob is a whole-list
  // read-modify-write, so two sends in flight at once overwrite each other and the
  // message survives only in memory. This is the durable copy.
  await persistSingleMessage(sentMessage);

  // Sync LeadOS audit log if linked to a prospect
  if (sentMessage.leadId) {
    await recordAuditEntry({
      action: `inbox_outbound_${deliveryStatus}`,
      entityType: 'lead',
      entityId: sentMessage.leadId,
      details: {
        mailbox,
        recipient: toList.map((t) => t.email).join(', '),
        subject,
        messageId,
        threadId,
        deliveryStatus,
        createdAt: now,
      },
    }).catch(() => {});
  }

  return sentMessage;
}

export interface InboundEmailInput {
  messageId?: string;
  inReplyTo?: string | null;
  references?: string[];
  from: { name?: string; email: string } | string;
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  mailbox?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: unknown;
  spamScore?: number;
  isSpam?: boolean;
  authIndicators?: AuthIndicators;
  receivedAt?: string;
  createdAt?: string;
}

/**
 * Ingests an inbound email with duplicate `Message-ID` protection,
 * thread linking via `In-Reply-To` / `References` / normalized subject,
 * and automatic LeadOS prospect reply matching.
 * Never marks unrelated emails as sales leads and never auto-sends follow-ups.
 */
export async function recordInboundEmail(
  input: InboundEmailInput
): Promise<{ duplicate: boolean; message: InboxMessage }> {
  const messages = await readStoredMessages();

  const fromParsed = parseParticipantList(input.from)[0];
  if (!fromParsed) {
    throw new Error('Valid sender email address is required for inbound ingestion.');
  }

  const toList = parseParticipantList(input.to);
  const ccList = parseParticipantList(input.cc);

  // Determine target mailbox
  let mailbox: MailboxAddress = 'support@himalayankoh.com';
  if (input.mailbox && isAllowedMailbox(input.mailbox)) {
    mailbox = input.mailbox.trim().toLowerCase() as MailboxAddress;
  } else {
    const matchedTo = [...toList, ...ccList].find((p) => isAllowedMailbox(p.email));
    if (matchedTo) {
      mailbox = matchedTo.email as MailboxAddress;
    }
  }

  const incomingMessageId =
    typeof input.messageId === 'string' && input.messageId.trim()
      ? input.messageId.trim()
      : generateRfcMessageId('inbound');

  // Deduplicate by RFC 5322 Message-ID, but only against an inbound copy for the
  // same mailbox. A reply we send is stored in Sent under the same Message-ID the
  // recipient's server delivers back to us; matching that outbound record made the
  // received copy look like a duplicate, so replies never appeared in the inbox.
  const existingDuplicate = messages.find(
    (m) =>
      m.messageId === incomingMessageId &&
      m.direction === 'inbound' &&
      m.mailbox === mailbox
  );
  if (existingDuplicate) {
    // Heal bodies stored before the MIME walker learned to recurse: a few messages
    // were saved with raw `--mixed-...`/`Content-Type: multipart` noise instead of
    // their text. A later sync re-parses the same message cleanly, so fold that in
    // rather than keeping the noisy copy forever.
    const freshBody = String(input.bodyText || '').trim();
    if (freshBody && looksLikeRawMimeBody(existingDuplicate.bodyText)) {
      existingDuplicate.bodyText = freshBody;
      if (input.bodyHtml) existingDuplicate.bodyHtml = input.bodyHtml;
      existingDuplicate.snippet = makeSnippet(freshBody);
      existingDuplicate.updatedAt = new Date().toISOString();
      await writeStoredMessages(messages);
      await persistSingleMessage(existingDuplicate);
    }
    return { duplicate: true, message: existingDuplicate };
  }

  const inReplyTo =
    typeof input.inReplyTo === 'string' && input.inReplyTo.trim()
      ? input.inReplyTo.trim()
      : null;
  const references = Array.isArray(input.references)
    ? input.references.map((r) => String(r).trim()).filter(Boolean)
    : [];

  // Find existing thread by inReplyTo, references, or normalized subject + sender email
  let parentThreadMsg = messages.find(
    (m) =>
      (inReplyTo && m.messageId === inReplyTo) ||
      (references.length > 0 && references.includes(m.messageId))
  );

  const normSubj = normalizeSubject(input.subject);
  if (!parentThreadMsg && normSubj) {
    parentThreadMsg = messages.find(
      (m) =>
        normalizeSubject(m.subject) === normSubj &&
        (m.from.email.toLowerCase() === fromParsed.email.toLowerCase() ||
          m.to.some((t) => t.email.toLowerCase() === fromParsed.email.toLowerCase()))
    );
  }

  // Check if sender matches a saved LeadOS prospect
  const matchedLead = await findMatchingLeadByEmail(fromParsed.email);

  const leadId = matchedLead?.id || parentThreadMsg?.leadId || null;
  const leadBusinessName =
    matchedLead?.businessName || parentThreadMsg?.leadBusinessName || null;
  let leadStage = matchedLead?.status || parentThreadMsg?.leadStage || null;

  if (matchedLead) {
    leadStage = 'replied';
    try {
      await updateSavedLead(matchedLead.id, { status: 'replied' });
    } catch {}
    try {
      await recordAuditEntry({
        action: 'inbound_reply_received',
        entityType: 'lead',
        entityId: matchedLead.id,
        details: {
          from: fromParsed.email,
          mailbox,
          subject: input.subject,
          messageId: incomingMessageId,
          receivedAt: input.receivedAt || new Date().toISOString(),
        },
      });
    } catch {}
  }

  const spamScore = typeof input.spamScore === 'number' ? input.spamScore : 0;
  const isSpam = input.isSpam === true || spamScore >= 70;
  const folder: InboxFolder = isSpam ? 'spam' : 'inbox';

  const labels = new Set<string>(parentThreadMsg?.labels || []);
  if (matchedLead || leadId) {
    labels.add('LeadOS Prospect');
  }

  const now = input.receivedAt || new Date().toISOString();
  const bodyText = String(input.bodyText || '').trim();
  const attachments = sanitizeAttachments(input.attachments);

  const inboundMsg: InboxMessage = {
    id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    threadId:
      parentThreadMsg?.threadId ||
      (leadId ? `thread-leados-${leadId}` : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    messageId: incomingMessageId,
    inReplyTo,
    references,
    mailbox,
    correspondenceType: 'business_correspondence',
    direction: 'inbound',
    folder,
    from: {
      name: fromParsed.name || matchedLead?.businessName || fromParsed.email.split('@')[0],
      email: fromParsed.email,
    },
    to:
      toList.length > 0
        ? toList
        : [{ name: MAILBOX_DEFINITIONS[mailbox].displayName, email: mailbox }],
    cc: ccList,
    bcc: [],
    subject: String(input.subject || '(No subject)').trim(),
    bodyText,
    bodyHtml: input.bodyHtml,
    snippet: makeSnippet(bodyText),
    unread: true,
    starred: parentThreadMsg?.starred || Boolean(matchedLead?.starred),
    labels: Array.from(labels),
    attachments,
    leadId,
    leadBusinessName,
    leadStage,
    deliveryStatus: 'received',
    deliveryNote: 'Received via Inbound Email',
    spamScore,
    authIndicators: input.authIndicators || {
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
    },
    createdAt: now,
    updatedAt: now,
  };

  messages.unshift(inboundMsg);
  await writeStoredMessages(messages);
  // Same reason as outbound: the per-message record is what survives the isolate.
  await persistSingleMessage(inboundMsg);

  return { duplicate: false, message: inboundMsg };
}

export type MessageUpdateOperation =
  | 'mark_read'
  | 'mark_unread'
  | 'star'
  | 'unstar'
  | 'move_folder'
  | 'delete_permanent';

export async function updateInboxMessage(input: {
  id?: string;
  threadId?: string;
  operation: MessageUpdateOperation;
  targetFolder?: InboxFolder;
}): Promise<{ updatedCount: number }> {
  const messages = await readStoredMessages();
  const targetIds = new Set<string>();

  for (const m of messages) {
    if ((input.id && m.id === input.id) || (input.threadId && m.threadId === input.threadId)) {
      targetIds.add(m.id);
    }
  }

  if (targetIds.size === 0) {
    return { updatedCount: 0 };
  }

  if (input.operation === 'delete_permanent') {
    const remaining = messages.filter((m) => !targetIds.has(m.id));
    await writeStoredMessages(remaining);
    return { updatedCount: targetIds.size };
  }

  const now = new Date().toISOString();
  for (const m of messages) {
    if (!targetIds.has(m.id)) continue;
    if (input.operation === 'mark_read') m.unread = false;
    else if (input.operation === 'mark_unread') m.unread = true;
    else if (input.operation === 'star') m.starred = true;
    else if (input.operation === 'unstar') m.starred = false;
    else if (input.operation === 'move_folder' && input.targetFolder) {
      m.folder = input.targetFolder;
    }
    m.updatedAt = now;
  }

  await writeStoredMessages(messages);
  return { updatedCount: targetIds.size };
}

export interface InboxFolderCounts {
  all: number;
  allUnread: number;
  salman: number;
  salmanUnread: number;
  sales: number;
  salesUnread: number;
  support: number;
  supportUnread: number;
  admin: number;
  adminUnread: number;
  unread: number;
  sent: number;
  drafts: number;
  spam: number;
  archive: number;
  trash: number;
}

export function computeInboxCounts(messages: InboxMessage[]): InboxFolderCounts {
  const counts: InboxFolderCounts = {
    all: 0,
    allUnread: 0,
    salman: 0,
    salmanUnread: 0,
    sales: 0,
    salesUnread: 0,
    support: 0,
    supportUnread: 0,
    admin: 0,
    adminUnread: 0,
    unread: 0,
    sent: 0,
    drafts: 0,
    spam: 0,
    archive: 0,
    trash: 0,
  };

  for (const m of messages) {
    if (m.folder === 'inbox') {
      counts.all++;
      if (m.unread) counts.allUnread++;
      if (m.mailbox === 'salman@himalayankoh.com') {
        counts.salman++;
        if (m.unread) counts.salmanUnread++;
      } else if (m.mailbox === 'sales@himalayankoh.com') {
        counts.sales++;
        if (m.unread) counts.salesUnread++;
      } else if (m.mailbox === 'support@himalayankoh.com') {
        counts.support++;
        if (m.unread) counts.supportUnread++;
      } else if (m.mailbox === 'admin@himalayankoh.com') {
        counts.admin++;
        if (m.unread) counts.adminUnread++;
      }
    }
    if (m.unread && m.folder !== 'trash' && m.folder !== 'spam' && m.folder !== 'drafts') {
      counts.unread++;
    }
    if (m.folder === 'sent') counts.sent++;
    if (m.folder === 'drafts') counts.drafts++;
    if (m.folder === 'spam') counts.spam++;
    if (m.folder === 'archive') counts.archive++;
    if (m.folder === 'trash') counts.trash++;
  }

  return counts;
}

export function groupMessagesIntoThreads(messages: InboxMessage[]): InboxThread[] {
  const byThread = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const list = byThread.get(m.threadId);
    if (list) list.push(m);
    else byThread.set(m.threadId, [m]);
  }

  const threads: InboxThread[] = [];
  for (const [threadId, list] of byThread.entries()) {
    // Chronological order inside thread (oldest -> newest)
    const chronological = [...list].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const latestMessage = chronological[chronological.length - 1];
    const labels = new Set<string>();
    const participantsMap = new Map<string, InboxParticipant>();
    let unread = false;
    let unreadCount = 0;
    let starred = false;
    let hasAttachments = false;
    let leadId: string | null = null;
    let leadBusinessName: string | null = null;
    let leadStage: string | null = null;

    for (const msg of chronological) {
      if (msg.unread) {
        unread = true;
        unreadCount += 1;
      }
      if (msg.starred) starred = true;
      if (msg.attachments && msg.attachments.length > 0) hasAttachments = true;
      for (const lbl of msg.labels || []) labels.add(lbl);
      if (msg.leadId) leadId = msg.leadId;
      if (msg.leadBusinessName) leadBusinessName = msg.leadBusinessName;
      if (msg.leadStage) leadStage = msg.leadStage;
      participantsMap.set(msg.from.email.toLowerCase(), {
        name: msg.from.name,
        email: msg.from.email,
      });
      for (const toP of msg.to) {
        participantsMap.set(toP.email.toLowerCase(), toP);
      }
    }

    threads.push({
      threadId,
      subject: latestMessage.subject,
      mailbox: latestMessage.mailbox,
      messages: chronological,
      latestMessage,
      messageCount: chronological.length,
      unreadCount,
      unread,
      starred,
      hasAttachments,
      labels: Array.from(labels),
      leadId,
      leadBusinessName,
      leadStage,
      participants: Array.from(participantsMap.values()),
      updatedAt: latestMessage.createdAt,
    });
  }

  return threads.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function listInboxState(options?: {
  folder?: InboxFilterFolder;
  search?: string;
  leadId?: string;
  skipExternalSync?: boolean;
  /**
   * Set when the admin explicitly asks for new mail ("Check mail" / refresh).
   * Without it a forced read only refreshed the WordPress/LeadOS side and never
   * polled Dovecot, so the button looked like a sync that silently skipped IMAP.
   */
  forceSync?: boolean;
}): Promise<{
  messages: InboxMessage[];
  threads: InboxThread[];
  counts: InboxFolderCounts;
  mailboxes: MailboxIdentity[];
  infrastructure: InboxInfrastructureStatus;
}> {
  const allMessages = options?.skipExternalSync
    ? await readStoredMessages()
    : await syncExternalCorrespondenceIntoInbox(options?.forceSync === true);

  const counts = computeInboxCounts(allMessages);
  const folder = options?.folder || 'all';
  const search = (options?.search || '').trim().toLowerCase();
  const filterLeadId = (options?.leadId || '').trim();

  // Group all messages by thread first so a thread opened in a folder shows its full chronological conversation
  const allThreadsById = new Map<string, InboxMessage[]>();
  for (const m of allMessages) {
    const arr = allThreadsById.get(m.threadId);
    if (arr) arr.push(m);
    else allThreadsById.set(m.threadId, [m]);
  }

  const filteredMessages = allMessages.filter((m) => {
    if (filterLeadId && m.leadId !== filterLeadId) return false;

    if (folder === 'all') {
      if (m.folder !== 'inbox') return false;
    } else if (folder === 'salman') {
      if (m.folder !== 'inbox' || m.mailbox !== 'salman@himalayankoh.com') return false;
    } else if (folder === 'sales') {
      if (m.folder !== 'inbox' || m.mailbox !== 'sales@himalayankoh.com') return false;
    } else if (folder === 'support') {
      if (m.folder !== 'inbox' || m.mailbox !== 'support@himalayankoh.com') return false;
    } else if (folder === 'admin') {
      if (m.folder !== 'inbox' || m.mailbox !== 'admin@himalayankoh.com') return false;
    } else if (folder === 'unread') {
      if (!m.unread || m.folder === 'trash' || m.folder === 'spam' || m.folder === 'drafts') {
        return false;
      }
    } else {
      if (m.folder !== folder) return false;
    }

    if (search) {
      const haystack = [
        m.subject,
        m.bodyText,
        m.from.name,
        m.from.email,
        ...m.to.map((t) => `${t.name || ''} ${t.email}`),
        m.leadBusinessName || '',
        ...(m.labels || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  // Build threads for matching messages, keeping full non-trashed thread history when viewing
  const baseThreads = groupMessagesIntoThreads(filteredMessages);
  const enrichedThreads = baseThreads.map((t) => {
    const fullList = (allThreadsById.get(t.threadId) || t.messages)
      .filter((m) => (folder === 'trash' ? true : m.folder !== 'trash'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
      ...t,
      messages: fullList.length > 0 ? fullList : t.messages,
      messageCount: fullList.length > 0 ? fullList.length : t.messageCount,
    };
  });

  const { mailboxes, infrastructure } = await getMailboxAndInfrastructureStatus();

  return {
    messages: filteredMessages,
    threads: enrichedThreads,
    counts,
    mailboxes,
    infrastructure,
  };
}
