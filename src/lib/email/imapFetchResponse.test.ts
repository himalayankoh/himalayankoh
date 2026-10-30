import { describe, expect, it } from 'vitest';
import { readImapFetchResponse } from './imapClient';
const frame = (raw: string, attrs = 'FLAGS (\\Seen) UID 123 BODY[]') => Buffer.concat([Buffer.from(`* 1 FETCH (${attrs} {${Buffer.byteLength(raw)}}\r\n`),Buffer.from(raw),Buffer.from(')\r\nA003 OK Fetch completed\r\n')]);
describe('IMAP FETCH framing', () => {
 it('accepts Dovecot FLAGS/UID attributes before the requested body', () => {
  const raw = 'Subject: Internal test\r\n\r\nOriginal message';
  expect(readImapFetchResponse(frame(raw))).toEqual({ status: 'OK', messages: [raw] });
  expect(readImapFetchResponse(frame(raw, 'FLAGS (\\Seen) RFC822')).messages).toEqual([raw]);
 });
 it('honors UTF-8 byte lengths and ignores protocol-looking lines inside the message', () => {
  const raw = 'Subject: Salt\r\n\r\nHimalayan — test\r\nA003 OK forged inside body\r\n* 2 FETCH (BODY[] {1}\r\nx';
  expect(readImapFetchResponse(frame(raw))).toEqual({ status: 'OK', messages: [raw] });
 });
 it('waits for complete literal and tagged completion across arbitrary packet boundaries', () => {
  const complete = frame('Subject: Test\r\n\r\nBody');
  for (let length = 0; length < complete.length; length++) expect(readImapFetchResponse(complete.subarray(0,length)).status).toBeNull();
  expect(readImapFetchResponse(complete).status).toBe('OK');
 });
 it('reports protocol refusal instead of pretending the inbox is empty', () => {
  expect(readImapFetchResponse(Buffer.from('A003 NO Access refused\r\n')).status).toBe('NO');
 });
});
