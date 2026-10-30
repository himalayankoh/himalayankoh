import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getChannel, saveChannel, deleteChannel } from '@/lib/youtube/store';
import type { YouTubeChannel } from '@/lib/youtube/store';

export const dynamic = 'force-dynamic';

// YouTube Data API v3 — fetch channel metadata
async function fetchChannelInfo(channelUrl: string, apiKey?: string): Promise<YouTubeChannel> {
  const handleMatch = channelUrl.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/);
  const channelMatch = channelUrl.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);

  if (apiKey) {
    let channelId = channelMatch?.[1] || '';

    if (!channelId && handleMatch) {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${handleMatch[1]}&key=${apiKey}`
      );
      const searchData = await searchRes.json();
      if (searchData.items?.length > 0) {
        channelId = searchData.items[0].id.channelId;
      }
    }

    if (channelId) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
      );
      const data = await res.json();
      if (data.items?.length > 0) {
        const ch = data.items[0];
        return {
          channelId: ch.id,
          channelUrl: `https://youtube.com/channel/${ch.id}`,
          channelTitle: ch.snippet.title,
          channelThumbnail: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url || '',
          subscriberCount: ch.statistics?.subscriberCount || '0',
          videoCount: ch.statistics?.videoCount || '0',
        };
      }
    }
  }

  const handle = handleMatch?.[1] || channelMatch?.[1] || 'unknown';
  return {
    channelId: handle,
    channelUrl: channelUrl.trim(),
    channelTitle: handle,
    channelThumbnail: '',
    subscriberCount: '',
    videoCount: '',
  };
}

// GET — fetch current channel config
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const channel = await getChannel();
  return NextResponse.json({ channel, apiKey: channel ? '••••••' : '' });
}

// POST — connect a channel
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { channelUrl?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.channelUrl?.trim()) {
    return NextResponse.json({ error: 'Channel URL is required' }, { status: 400 });
  }

  const channelInfo = await fetchChannelInfo(body.channelUrl.trim(), body.apiKey?.trim());
  await saveChannel(channelInfo, body.apiKey?.trim() || undefined);

  return NextResponse.json({ channel: channelInfo });
}

// DELETE — disconnect channel
export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await deleteChannel();
  return NextResponse.json({ ok: true });
}
