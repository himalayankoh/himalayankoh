import { describe, expect, it } from 'vitest';
import { parseRawRfc822Email } from './imapClient';

const nested = [
  'From: cPanel <cpanel@himalayankoh.com>',
  'To: support@himalayankoh.com',
  'Subject: Client configuration',
  'Message-ID: <nested-1@himalayankoh.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="mixed-1"',
  '',
  '--mixed-1',
  'Content-Type: multipart/alternative; boundary="alt-1"',
  '',
  '--alt-1',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Settings for support@himalayankoh.com=2E',
  '--alt-1',
  'Content-Type: text/html; charset=UTF-8',
  '',
  '<p>Settings for support@himalayankoh.com.</p>',
  '--alt-1--',
  '--mixed-1--',
].join('\r\n');

const base64Body = [
  'From: Sender <sender@example.com>',
  'To: sales@himalayankoh.com',
  'Subject: =?UTF-8?B?SGVsbG8gZnJvbSB0aGUgYnV5ZXI=?=',
  'Message-ID: <b64-1@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('We would like a pallet of 2lb blocks.', 'utf8').toString('base64'),
].join('\r\n');

describe('parseRawRfc822Email', () => {
  it('extracts the inner text of nested multipart messages instead of MIME boundaries', () => {
    const parsed = parseRawRfc822Email(nested, 'support@himalayankoh.com');

    expect(parsed.subject).toBe('Client configuration');
    expect(parsed.bodyText).toBe('Settings for support@himalayankoh.com.');
    expect(parsed.bodyHtml).toContain('<p>Settings');
    expect(parsed.snippet).not.toContain('--mixed-1');
    expect(parsed.snippet).not.toContain('--alt-1');
  });

  it('decodes base64 bodies and RFC 2047 subjects', () => {
    const parsed = parseRawRfc822Email(base64Body, 'sales@himalayankoh.com');

    expect(parsed.subject).toBe('Hello from the buyer');
    expect(parsed.bodyText).toBe('We would like a pallet of 2lb blocks.');
    expect(parsed.from.email).toBe('sender@example.com');
  });
});
