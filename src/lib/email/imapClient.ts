/**
 * Himalayan Koh — Namecheap cPanel IMAP & SMTP Connection Engine
 *
 * Direct SMTPS (Port 465) and IMAPS (Port 993) verification and mail sync:
 * - Strict TLS certificate verification (rejectUnauthorized: true).
 * - Connects to Dovecot IMAP and Exim SMTP on premium164.web-hosting.com (@ 162.0.209.25).
 * - Real protocol-level authentication tests.
 * - Inbound email fetching and RFC 5322 parsing.
 * - Fails closed: Never reports success on error or simulation.
 */

export interface ImapConnectionConfig {
  host?: string;
  port?: number;
  user: string;
  pass: string;
  timeoutMs?: number;
}

export interface SmtpConnectionConfig {
  host?: string;
  port?: number;
  user: string;
  pass: string;
  timeoutMs?: number;
}

export interface ConnectionTestResult {
  ok: boolean;
  protocol: 'imap' | 'smtp';
  host: string;
  port: number;
  user: string;
  status: 'authenticated' | 'auth_failed' | 'connection_failed' | 'timeout';
  serverGreeting?: string;
  serverReply?: string;
  error?: string;
  timestamp: string;
}

export interface ParsedInboundEmail {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  mailbox: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  snippet: string;
  flags: string[];
}

const DEFAULT_HOST = 'premium164.web-hosting.com';
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Test real IMAP TLS Authentication against port 993.
 */
export async function testImapAuthentication(
  config: ImapConnectionConfig
): Promise<ConnectionTestResult> {
  const host = config.host || DEFAULT_HOST;
  const port = config.port || DEFAULT_IMAP_PORT;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timestamp = new Date().toISOString();

  if (!config.user || !config.pass) {
    return {
      ok: false,
      protocol: 'imap',
      host,
      port,
      user: config.user || '',
      status: 'auth_failed',
      error: 'Username and password are required.',
      timestamp,
    };
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    return {
      ok: false,
      protocol: 'imap',
      host,
      port,
      user: config.user,
      status: 'connection_failed',
      error: 'Runtime lacks TCP/TLS socket capabilities.',
      timestamp,
    };
  }

  const tls = await import('node:tls');

  return new Promise<ConnectionTestResult>((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let finished = false;
    let greeting = '';
    let responseText = '';

    const done = (result: ConnectionTestResult) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      done({
        ok: false,
        protocol: 'imap',
        host,
        port,
        user: config.user,
        status: 'timeout',
        error: `IMAP connection timed out after ${timeoutMs}ms`,
        timestamp,
      });
    }, timeoutMs);

    const socket = tls.connect(
      port,
      host,
      { rejectUnauthorized: true, servername: host },
      () => {
        // TLS Handshake completed and certificate verified
      }
    );

    socket.setEncoding('utf8');

    socket.on('data', (data: string) => {
      responseText += data;
      const lines = responseText.split('\r\n');

      if (!greeting && lines.length > 0 && lines[0].startsWith('* OK')) {
        greeting = lines[0];
        // Send LOGIN command with escaped quotes
        const safeUser = config.user.replace(/["\\]/g, '\\$&');
        const safePass = config.pass.replace(/["\\]/g, '\\$&');
        socket.write(`A001 LOGIN "${safeUser}" "${safePass}"\r\n`);
      } else if (responseText.includes('A001 OK')) {
        const reply = lines.find((l) => l.startsWith('A001 OK')) || 'A001 OK';
        socket.write('A002 LOGOUT\r\n');
        done({
          ok: true,
          protocol: 'imap',
          host,
          port,
          user: config.user,
          status: 'authenticated',
          serverGreeting: greeting,
          serverReply: reply.trim(),
          timestamp,
        });
      } else if (responseText.includes('A001 NO') || responseText.includes('A001 BAD')) {
        const reply =
          lines.find((l) => l.startsWith('A001 NO') || l.startsWith('A001 BAD')) ||
          'A001 NO Authentication failed';
        socket.write('A002 LOGOUT\r\n');
        done({
          ok: false,
          protocol: 'imap',
          host,
          port,
          user: config.user,
          status: 'auth_failed',
          serverGreeting: greeting,
          serverReply: reply.trim(),
          error: `IMAP Authentication Rejected: ${reply.trim()}`,
          timestamp,
        });
      }
    });

    socket.on('error', (err) => {
      done({
        ok: false,
        protocol: 'imap',
        host,
        port,
        user: config.user,
        status: 'connection_failed',
        error: `IMAP TLS Socket Error: ${err.message}`,
        timestamp,
      });
    });
  });
}

/**
 * Test real SMTP TLS Authentication against port 465.
 */
export async function testSmtpAuthentication(
  config: SmtpConnectionConfig
): Promise<ConnectionTestResult> {
  const host = config.host || DEFAULT_HOST;
  const port = config.port || DEFAULT_SMTP_PORT;
  const timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timestamp = new Date().toISOString();

  if (!config.user || !config.pass) {
    return {
      ok: false,
      protocol: 'smtp',
      host,
      port,
      user: config.user || '',
      status: 'auth_failed',
      error: 'Username and password are required.',
      timestamp,
    };
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    return {
      ok: false,
      protocol: 'smtp',
      host,
      port,
      user: config.user,
      status: 'connection_failed',
      error: 'Runtime lacks TCP/TLS socket capabilities.',
      timestamp,
    };
  }

  const tls = await import('node:tls');

  return new Promise<ConnectionTestResult>((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let finished = false;
    let step = 0;
    let greeting = '';

    const done = (result: ConnectionTestResult) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      done({
        ok: false,
        protocol: 'smtp',
        host,
        port,
        user: config.user,
        status: 'timeout',
        error: `SMTP connection timed out after ${timeoutMs}ms`,
        timestamp,
      });
    }, timeoutMs);

    const socket = tls.connect(
      port,
      host,
      { rejectUnauthorized: true, servername: host },
      () => {
        // TLS Handshake completed and certificate verified
      }
    );

    socket.setEncoding('utf8');

    socket.on('data', (data: string) => {
      const lines = data.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';

      if (step === 0 && lastLine.startsWith('220')) {
        greeting = lastLine;
        step = 1;
        socket.write('EHLO himalayankoh.com\r\n');
      } else if (step === 1 && (lastLine.startsWith('250') || lastLine.includes('250 '))) {
        step = 2;
        socket.write('AUTH LOGIN\r\n');
      } else if (step === 2 && lastLine.startsWith('334')) {
        step = 3;
        socket.write(`${Buffer.from(config.user).toString('base64')}\r\n`);
      } else if (step === 3 && lastLine.startsWith('334')) {
        step = 4;
        socket.write(`${Buffer.from(config.pass).toString('base64')}\r\n`);
      } else if (step === 4) {
        if (lastLine.startsWith('235')) {
          socket.write('QUIT\r\n');
          done({
            ok: true,
            protocol: 'smtp',
            host,
            port,
            user: config.user,
            status: 'authenticated',
            serverGreeting: greeting,
            serverReply: lastLine.trim(),
            timestamp,
          });
        } else if (lastLine.startsWith('535') || lastLine.startsWith('5')) {
          socket.write('QUIT\r\n');
          done({
            ok: false,
            protocol: 'smtp',
            host,
            port,
            user: config.user,
            status: 'auth_failed',
            serverGreeting: greeting,
            serverReply: lastLine.trim(),
            error: `SMTP Authentication Rejected: ${lastLine.trim()}`,
            timestamp,
          });
        }
      }
    });

    socket.on('error', (err) => {
      done({
        ok: false,
        protocol: 'smtp',
        host,
        port,
        user: config.user,
        status: 'connection_failed',
        error: `SMTP TLS Socket Error: ${err.message}`,
        timestamp,
      });
    });
  });
}

/**
 * Decode RFC 2047 Encoded Words: =?UTF-8?B?...?= or =?UTF-8?Q?...?=
 */
export function decodeMimeHeader(raw: string): string {
  if (!raw) return '';
  return raw.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, _charset, encoding, encodedText) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(encodedText, 'base64').toString('utf8');
      } else if (encoding.toUpperCase() === 'Q') {
        const unescaped = encodedText
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
          );
        return unescaped;
      }
    } catch {
      return encodedText;
    }
    return encodedText;
  });
}

/**
 * Parse an email address string like 'Name <email@domain.com>' or 'email@domain.com'
 */
export function parseAddress(raw: string): { name: string; email: string } {
  const trimmed = (raw || '').trim();
  const match = trimmed.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  if (match) {
    return {
      name: decodeMimeHeader(match[1]?.trim() || match[2].trim()),
      email: match[2].trim().toLowerCase(),
    };
  }
  return {
    name: decodeMimeHeader(trimmed),
    email: trimmed.toLowerCase(),
  };
}

/**
 * Parse multiple comma-separated email addresses
 */
export function parseAddressList(raw?: string): Array<{ name: string; email: string }> {
  if (!raw) return [];
  const parts = raw.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  return parts.map(parseAddress).filter((a) => a.email.includes('@'));
}

/**
 * Parse raw RFC 822 email headers and body
 */
export function parseRawRfc822Email(raw: string, targetMailbox: string): ParsedInboundEmail {
  // Separate header block from body by first \r\n\r\n or \n\n
  const headerEndPos = raw.search(/\r?\n\r?\n/);
  const headerBlock = headerEndPos !== -1 ? raw.slice(0, headerEndPos) : raw;
  const rawBody = headerEndPos !== -1 ? raw.slice(headerEndPos).replace(/^\r?\n\r?\n/, '') : '';

  // Unfold headers (continuation lines starting with space or tab)
  const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, ' ');
  const headerLines = unfoldedHeaders.split(/\r?\n/);

  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }

  const subject = decodeMimeHeader(headers['subject'] || '(No Subject)');
  const from = parseAddress(headers['from'] || 'Unknown <unknown@unknown.com>');
  const to = parseAddressList(headers['to'] || targetMailbox);
  const cc = parseAddressList(headers['cc']);

  const messageId =
    headers['message-id'] || `<hk-inbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@himalayankoh.com>`;
  const inReplyTo = headers['in-reply-to'] || null;
  const references = (headers['references'] || '')
    .split(/\s+/)
    .map((r) => r.trim())
    .filter(Boolean);

  let dateStr = new Date().toISOString();
  if (headers['date']) {
    const parsed = Date.parse(headers['date']);
    if (!isNaN(parsed)) {
      dateStr = new Date(parsed).toISOString();
    }
  }

  // Extract body
  let bodyText = '';
  let bodyHtml: string | undefined = undefined;

  const contentType = headers['content-type'] || 'text/plain';

  if (contentType.toLowerCase().includes('multipart/')) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] : null;

    if (boundary) {
      const parts = rawBody.split(`--${boundary}`);
      for (const part of parts) {
        if (part.trim() === '--' || !part.trim()) continue;
        const partHeaderEnd = part.search(/\r?\n\r?\n/);
        const partHeaders = partHeaderEnd !== -1 ? part.slice(0, partHeaderEnd).toLowerCase() : '';
        const partContent = partHeaderEnd !== -1 ? part.slice(partHeaderEnd).replace(/^\r?\n\r?\n/, '') : part;

        if (partHeaders.includes('text/html')) {
          bodyHtml = partContent.trim();
        } else if (partHeaders.includes('text/plain') && !bodyText) {
          bodyText = partContent.trim();
        }
      }
    }
  }

  if (!bodyText && !bodyHtml) {
    if (contentType.toLowerCase().includes('text/html')) {
      bodyHtml = rawBody.trim();
    } else {
      bodyText = rawBody.trim();
    }
  }

  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const snippet = (bodyText || bodyHtml?.replace(/<[^>]+>/g, ' ') || subject)
    .trim()
    .slice(0, 160);

  return {
    messageId,
    inReplyTo,
    references,
    mailbox: targetMailbox,
    from,
    to,
    cc,
    subject,
    date: dateStr,
    bodyText,
    bodyHtml,
    snippet,
    flags: [],
  };
}

/**
 * Fetch recent incoming messages via IMAP TLS from premium164.web-hosting.com:993
 */
export async function fetchRecentImapEmails(options: {
  host?: string;
  port?: number;
  user: string;
  pass: string;
  folder?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<{ ok: boolean; count: number; messages: ParsedInboundEmail[]; error?: string }> {
  const host = options.host || DEFAULT_HOST;
  const port = options.port || DEFAULT_IMAP_PORT;
  const folder = options.folder || 'INBOX';
  const limit = Math.max(1, Math.min(options.limit || 20, 100));
  const timeoutMs = options.timeoutMs || 25000;

  if (!options.user || !options.pass) {
    return { ok: false, count: 0, messages: [], error: 'User and password are required' };
  }

  if (typeof process === 'undefined' || !process.versions?.node) {
    return { ok: false, count: 0, messages: [], error: 'Runtime environment lacks TCP socket capability' };
  }

  const tls = await import('node:tls');

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    let finished = false;
    let buffer = '';
    let step = 'await_greeting';
    let existsCount = 0;
    const rawMessages: string[] = [];

    const done = (result: { ok: boolean; count: number; messages: ParsedInboundEmail[]; error?: string }) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    timer = setTimeout(() => {
      done({ ok: false, count: 0, messages: [], error: `IMAP fetch timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    const socket = tls.connect(
      port,
      host,
      { rejectUnauthorized: true, servername: host },
      () => {
        // Connected
      }
    );

    socket.setEncoding('utf8');

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      if (step === 'await_greeting') {
        if (buffer.includes('* OK')) {
          buffer = '';
          step = 'login_sent';
          const safeUser = options.user.replace(/["\\]/g, '\\$&');
          const safePass = options.pass.replace(/["\\]/g, '\\$&');
          socket.write(`A001 LOGIN "${safeUser}" "${safePass}"\r\n`);
        }
      } else if (step === 'login_sent') {
        if (buffer.includes('A001 OK')) {
          buffer = '';
          step = 'select_sent';
          socket.write(`A002 SELECT "${folder}"\r\n`);
        } else if (buffer.includes('A001 NO') || buffer.includes('A001 BAD')) {
          const errLine = buffer.split('\r\n').find((l) => l.startsWith('A001')) || buffer.trim();
          done({ ok: false, count: 0, messages: [], error: `IMAP login failed: ${errLine}` });
        }
      } else if (step === 'select_sent') {
        if (buffer.includes('A002 OK')) {
          const existsMatch = buffer.match(/\*\s+(\d+)\s+EXISTS/i);
          if (existsMatch) {
            existsCount = parseInt(existsMatch[1], 10);
          }
          buffer = '';

          if (existsCount <= 0) {
            socket.write('A004 LOGOUT\r\n');
            done({ ok: true, count: 0, messages: [] });
            return;
          }

          const start = Math.max(1, existsCount - limit + 1);
          const end = existsCount;
          step = 'fetch_sent';
          socket.write(`A003 FETCH ${start}:${end} (RFC822)\r\n`);
        } else if (buffer.includes('A002 NO') || buffer.includes('A002 BAD')) {
          done({ ok: false, count: 0, messages: [], error: `IMAP select "${folder}" failed` });
        }
      } else if (step === 'fetch_sent') {
        if (buffer.includes('A003 OK')) {
          socket.write('A004 LOGOUT\r\n');

          // Split messages by '* <seq> FETCH (RFC822 {'
          const parts = buffer.split(/\*\s+\d+\s+FETCH\s+\(RFC822\s+\{\d+\}\r?\n/i);
          for (let i = 1; i < parts.length; i++) {
            const raw = parts[i];
            const endIdx = raw.lastIndexOf(')\r\n');
            const cleanContent = endIdx !== -1 ? raw.slice(0, endIdx) : raw;
            rawMessages.push(cleanContent);
          }

          const parsed = rawMessages.map((r) => parseRawRfc822Email(r, options.user));
          done({ ok: true, count: parsed.length, messages: parsed });
        } else if (buffer.includes('A003 NO') || buffer.includes('A003 BAD')) {
          done({ ok: false, count: 0, messages: [], error: 'IMAP fetch command failed' });
        }
      }
    });

    socket.on('error', (err) => {
      done({ ok: false, count: 0, messages: [], error: `IMAP socket error: ${err.message}` });
    });
  });
}
