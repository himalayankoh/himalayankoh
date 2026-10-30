import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/auth/verifyAdminRequest';
import { getVideos, addVideo } from '@/lib/youtube/store';
import type { YouTubeVideo } from '@/lib/youtube/store';

export const dynamic = 'force-dynamic';

// YouTube oEmbed — fetch video metadata without API key
async function fetchVideoInfo(videoId: string): Promise<{
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
}> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!res.ok) throw new Error('oembed failed');
    const data = await res.json();
    return {
      title: data.title || `YouTube Video ${videoId}`,
      description: '',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: data.author_name || '',
      publishedAt: '',
      duration: '',
    };
  } catch {
    return {
      title: `YouTube Video ${videoId}`,
      description: '',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: '',
      publishedAt: '',
      duration: '',
    };
  }
}

// GET — list all videos
export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const videos = await getVideos();
  return NextResponse.json({ videos });
}

// POST — add a video
export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { videoId?: string; youtubeUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.videoId?.trim()) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  const videoId = body.videoId.trim();
  const info = await fetchVideoInfo(videoId);

  const video: YouTubeVideo = {
    id: `yt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    videoId,
    youtubeUrl: body.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
    title: info.title,
    description: info.description,
    thumbnailUrl: info.thumbnailUrl,
    duration: info.duration,
    publishedAt: info.publishedAt || new Date().toISOString(),
    channelTitle: info.channelTitle,
    showOnStorefront: true,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    const saved = await addVideo(video);
    return NextResponse.json({ video: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }
}
