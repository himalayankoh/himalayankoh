/**
 * The only way a resale certificate leaves the database.
 *
 * The file is stored base64-encoded on the application row, so there is no uploads
 * directory to guess a URL for and nothing for a search engine or a crawler to find.
 * This route asks the console session who is downloading, then answers with
 * `no-store` and a `nosniff` content type — the browser may display it inline in the
 * review panel, but nothing may cache it and nothing may reinterpret it.
 *
 * A buyer's own session is deliberately not accepted here: the certificate review is
 * the owner's evidence, and the applicant already has the document they uploaded.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { wholesaleDisabled } from '@/lib/wholesale/gate';
import { getWholesaleRecord } from '@/lib/wholesale/store';

export const dynamic = 'force-dynamic';

/** The only types this route will ever serve, whatever the stored metadata says. */
const SAFE_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Decodes standard base64 into bytes without Buffer, so workerd and Node both work. */
function toBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** A filename that cannot break out of a header or a directory. */
function safeFileName(value: string): string {
  const cleaned = value.replace(/[^\w.\- ]/g, '').trim().slice(0, 100);
  return cleaned || 'resale-certificate';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const disabled = wholesaleDisabled();
  if (disabled) return disabled;

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId) || applicationId <= 0) {
    return NextResponse.json({ error: 'A valid application id is required.' }, { status: 400 });
  }

  let row: Record<string, unknown>;
  try {
    row = await getWholesaleRecord('applications', applicationId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The application could not be read.' },
      { status: 502 }
    );
  }

  const base64 = text(row.certificate_data);
  if (!base64) {
    return NextResponse.json({ error: 'No certificate file was attached to that application.' }, { status: 404 });
  }

  const bytes = toBytes(base64);
  if (!bytes || !bytes.length) {
    return NextResponse.json({ error: 'The stored certificate could not be read.' }, { status: 500 });
  }

  const storedType = text(row.certificate_file_type).toLowerCase();
  const contentType = SAFE_TYPES[storedType] ?? 'application/octet-stream';
  const name = safeFileName(text(row.certificate_file_name));

  // A Response body wants an ArrayBuffer, not a view that may share a larger buffer.
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${name}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store, private, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
