/**
 * Uploads an admin-supplied image (a data URL or base64 body) to the WordPress
 * Media Library.
 *
 * Supabase Storage owned these files; WordPress does now, through
 * `lib/media/wordpressMedia.ts`. The request shape is unchanged so the admin image
 * editor keeps working, and the response still carries `publicUrl` — the difference
 * is whose URL it is.
 *
 * `path` used to be the object's storage key. It is the attachment id now, because
 * that is what WordPress needs to attach the file to a post or a product later; a
 * storage key would be a dead string.
 */

import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { WordPressApiError } from '@/lib/backend/wordpress';
import { MAX_MEDIA_BYTES, extensionForContentType, uploadMediaToWordPress } from '@/lib/media/wordpressMedia';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    productId?: string;
    filename?: string;
    contentType?: string;
    base64?: string;
    altText?: string;
    title?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { base64, contentType = 'image/jpeg', filename = 'image.jpg' } = body;
  if (!base64 || typeof base64 !== 'string') {
    return NextResponse.json({ error: 'Base64 image data is required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(contentType.toLowerCase())) {
    return NextResponse.json(
      { error: `Unsupported image type (${contentType}). Use JPG, PNG, WebP, GIF, or AVIF.` },
      { status: 400 }
    );
  }

  // A data URL prefix is what a FileReader produces; the payload is what follows it.
  const base64Data = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'The image is empty.' }, { status: 400 });
  }
  if (buffer.length > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: `Image file size exceeds the ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB limit.` },
      { status: 400 }
    );
  }

  const ext = (filename.split('.').pop() || extensionForContentType(contentType))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || extensionForContentType(contentType);

  try {
    const media = await uploadMediaToWordPress({
      buffer,
      filename: `${crypto.randomUUID()}.${ext}`,
      contentType,
      title: body.title || filename,
      altText: body.altText,
    });

    return NextResponse.json({
      publicUrl: media.sourceUrl,
      path: String(media.id),
      mediaId: media.id,
      size: buffer.length,
    });
  } catch (error) {
    if (error instanceof WordPressApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 502 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Media upload service error' },
      { status: 500 }
    );
  }
}
