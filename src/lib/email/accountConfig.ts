/**
 * Himalayan Koh — Secure Mailbox Account Configuration Store
 *
 * Manages configuration and credentials for:
 *   - sales@himalayankoh.com
 *   - support@himalayankoh.com
 *   - salman@himalayankoh.com
 *   - admin@himalayankoh.com
 *
 * Security:
 * - Credentials are stored server-side in WordPress options (category: 'email_accounts') or Worker env.
 * - Passwords are NEVER sent to the client; client views receive '••••••••' or empty.
 * - Never logs raw passwords.
 */

import { siteSettingsApi } from '@/lib/wordpress/siteContent';

export type MailboxEmail =
  | 'sales@himalayankoh.com'
  | 'support@himalayankoh.com'
  | 'salman@himalayankoh.com'
  | 'admin@himalayankoh.com';

export const SUPPORTED_MAILBOXES: MailboxEmail[] = [
  'sales@himalayankoh.com',
  'support@himalayankoh.com',
  'salman@himalayankoh.com',
  'admin@himalayankoh.com',
];

export const MAILBOX_METADATA: Record<
  MailboxEmail,
  { label: string; displayName: string; role: string; defaultSignature: string }
> = {
  'sales@himalayankoh.com': {
    label: 'Sales',
    displayName: 'Himalayan Koh Commercial Sales',
    role: 'B2B Wholesale & Commercial Sales',
    defaultSignature:
      'Himalayan Koh Commercial Sales\nsales@himalayankoh.com | https://himalayankoh.com\n12620 FM 1960 W Ste A-4, Houston, TX 77065',
  },
  'support@himalayankoh.com': {
    label: 'Support',
    displayName: 'Himalayan Koh Customer Support',
    role: 'Customer Service & Inquiries',
    defaultSignature:
      'Himalayan Koh Customer Support\nsupport@himalayankoh.com | https://himalayankoh.com',
  },
  'salman@himalayankoh.com': {
    label: 'Salman',
    displayName: 'Salman — Himalayan Koh',
    role: 'Executive & Founder Correspondence',
    defaultSignature:
      'Salman\nFounder, Himalayan Koh\nsalman@himalayankoh.com | https://himalayankoh.com',
  },
  'admin@himalayankoh.com': {
    label: 'Admin',
    displayName: 'Himalayan Koh Administration',
    role: 'System & Security Operations',
    defaultSignature:
      'Himalayan Koh Administration\nadmin@himalayankoh.com | https://himalayankoh.com',
  },
};

export interface StoredMailboxCredentials {
  mailbox: MailboxEmail;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  smtpStatus: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  imapStatus: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  lastTestedAt?: string;
  lastError?: string;
  source: 'db' | 'env' | 'unset';
}

export interface ClientMailboxView {
  mailbox: MailboxEmail;
  label: string;
  displayName: string;
  role: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPass: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  hasImapPass: boolean;
  smtpStatus: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  imapStatus: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  lastTestedAt?: string;
  lastError?: string;
  source: 'db' | 'env' | 'unset';
}

const SETTINGS_CATEGORY = 'email_accounts';
const DEFAULT_HOST = 'premium164.web-hosting.com';
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_IMAP_PORT = 993;

let memoryCache: Record<string, string> | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60_000;

function cleanKey(email: string): string {
  const local = email.split('@')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return local || email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Read raw settings from WordPress or environment
 */
async function loadSettingsRaw(): Promise<Record<string, string>> {
  if (memoryCache && Date.now() - lastCacheTime < CACHE_TTL_MS) {
    return memoryCache;
  }

  try {
    const values = await siteSettingsApi.read(SETTINGS_CATEGORY);
    if (values) {
      const stringValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (typeof v === 'string') {
          stringValues[k] = v;
        }
      }
      memoryCache = stringValues;
      lastCacheTime = Date.now();
      return stringValues;
    }
  } catch {
    // If WordPress settings unreachable, fall back to process.env
  }

  memoryCache = memoryCache || {};
  return memoryCache;
}

/**
 * Get account credentials for a specific mailbox.
 */
export async function getEmailAccount(
  mailbox: MailboxEmail
): Promise<StoredMailboxCredentials> {
  const settings = await loadSettingsRaw();
  return resolveAccountWithSettings(mailbox, settings);
}

/**
 * Synchronous resolver for runtime email senders using cached values or env.
 */
export function getEmailAccountSync(mailbox: MailboxEmail): StoredMailboxCredentials {
  return resolveAccountWithSettings(mailbox, memoryCache || {});
}

function resolveAccountWithSettings(
  mailbox: MailboxEmail,
  settings: Record<string, string>
): StoredMailboxCredentials {
  const key = cleanKey(mailbox);
  const upperKey = key.toUpperCase();

  const envSmtpUser =
    process.env[`SMTP_USER_${upperKey}`] ||
    process.env[`NAMECHEAP_SMTP_USER_${upperKey}`] ||
    process.env.NAMECHEAP_SMTP_USER ||
    process.env.SMTP_USER;

  const envSmtpPass =
    process.env[`SMTP_PASS_${upperKey}`] ||
    process.env[`NAMECHEAP_SMTP_PASS_${upperKey}`] ||
    process.env.NAMECHEAP_SMTP_PASS ||
    process.env.SMTP_PASS;

  const envImapUser =
    process.env[`IMAP_USER_${upperKey}`] ||
    process.env.NAMECHEAP_IMAP_USER ||
    envSmtpUser;

  const envImapPass =
    process.env[`IMAP_PASS_${upperKey}`] ||
    process.env.NAMECHEAP_IMAP_PASS ||
    envSmtpPass;

  const dbSmtpUser = settings[`${key}_smtp_user`];
  const dbSmtpPass = settings[`${key}_smtp_pass`];
  const dbImapUser = settings[`${key}_imap_user`];
  const dbImapPass = settings[`${key}_imap_pass`];

  const smtpUser = dbSmtpUser || envSmtpUser || mailbox;
  const smtpPass = dbSmtpPass || envSmtpPass || '';
  const imapUser = dbImapUser || envImapUser || smtpUser;
  const imapPass = dbImapPass || envImapPass || smtpPass;

  const smtpHost =
    settings['smtp_host'] ||
    process.env.NAMECHEAP_SMTP_HOST ||
    DEFAULT_HOST;

  const smtpPort = Number(
    settings['smtp_port'] ||
    process.env.NAMECHEAP_SMTP_PORT ||
    DEFAULT_SMTP_PORT
  );

  const imapHost =
    settings['imap_host'] ||
    process.env.NAMECHEAP_IMAP_HOST ||
    DEFAULT_HOST;

  const imapPort = Number(
    settings['imap_port'] ||
    process.env.NAMECHEAP_IMAP_PORT ||
    DEFAULT_IMAP_PORT
  );

  const source: 'db' | 'env' | 'unset' =
    dbSmtpPass ? 'db' : envSmtpPass ? 'env' : 'unset';

  const rawSmtpStatus = settings[`${key}_smtp_status`];
  const rawImapStatus = settings[`${key}_imap_status`];

  const smtpStatus =
    rawSmtpStatus === 'authenticated' || rawSmtpStatus === 'auth_failed'
      ? rawSmtpStatus
      : smtpPass
      ? 'configured'
      : 'unconfigured';

  const imapStatus =
    rawImapStatus === 'authenticated' || rawImapStatus === 'auth_failed'
      ? rawImapStatus
      : imapPass
      ? 'configured'
      : 'unconfigured';

  return {
    mailbox,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    imapHost,
    imapPort,
    imapUser,
    imapPass,
    smtpStatus,
    imapStatus,
    lastTestedAt: settings[`${key}_last_tested`],
    lastError: settings[`${key}_last_error`],
    source,
  };
}

/**
 * Returns all configured mailboxes for the admin interface.
 */
export async function getAllEmailAccounts(): Promise<StoredMailboxCredentials[]> {
  const settings = await loadSettingsRaw();
  return SUPPORTED_MAILBOXES.map((m) => resolveAccountWithSettings(m, settings));
}

/**
 * Returns sanitized, client-safe representations with passwords masked.
 */
export function toClientMailboxView(
  account: StoredMailboxCredentials
): ClientMailboxView {
  const meta = MAILBOX_METADATA[account.mailbox] || {
    label: account.mailbox,
    displayName: account.mailbox,
    role: 'Commercial Email',
  };

  return {
    mailbox: account.mailbox,
    label: meta.label,
    displayName: meta.displayName,
    role: meta.role,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpUser: account.smtpUser,
    hasSmtpPass: Boolean(account.smtpPass),
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapUser: account.imapUser,
    hasImapPass: Boolean(account.imapPass),
    smtpStatus: account.smtpStatus,
    imapStatus: account.imapStatus,
    lastTestedAt: account.lastTestedAt,
    lastError: account.lastError,
    source: account.source,
  };
}

/**
 * Save updated credentials securely into the WordPress settings store.
 */
export async function saveEmailAccountCredentials(input: {
  mailbox: MailboxEmail;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  smtpStatus?: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  imapStatus?: 'unconfigured' | 'configured' | 'authenticated' | 'auth_failed';
  lastError?: string | null;
}): Promise<StoredMailboxCredentials> {
  const key = cleanKey(input.mailbox);
  const current = await getEmailAccount(input.mailbox);

  const updates: Record<string, string | null> = {};

  if (input.smtpHost) updates['smtp_host'] = input.smtpHost.trim();
  if (input.smtpPort) updates['smtp_port'] = String(input.smtpPort);
  if (input.imapHost) updates['imap_host'] = input.imapHost.trim();
  if (input.imapPort) updates['imap_port'] = String(input.imapPort);

  if (input.smtpUser) updates[`${key}_smtp_user`] = input.smtpUser.trim();
  if (input.imapUser) updates[`${key}_imap_user`] = input.imapUser.trim();

  // If password is not a mask '••', update it
  if (input.smtpPass && !input.smtpPass.startsWith('••')) {
    updates[`${key}_smtp_pass`] = input.smtpPass.trim();
  }
  if (input.imapPass && !input.imapPass.startsWith('••')) {
    updates[`${key}_imap_pass`] = input.imapPass.trim();
  }

  if (input.smtpStatus) updates[`${key}_smtp_status`] = input.smtpStatus;
  if (input.imapStatus) updates[`${key}_imap_status`] = input.imapStatus;
  if (input.smtpStatus || input.imapStatus) {
    updates[`${key}_last_tested`] = new Date().toISOString();
  }
  if (input.lastError !== undefined) {
    updates[`${key}_last_error`] = input.lastError || '';
  }

  await siteSettingsApi.write(SETTINGS_CATEGORY, updates);

  // Invalidate cache
  memoryCache = null;
  lastCacheTime = 0;

  return getEmailAccount(input.mailbox);
}
