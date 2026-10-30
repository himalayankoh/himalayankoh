import { NextResponse } from 'next/server';
import { getChannel, getVisibleVideos } from '@/lib/youtube/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const channel = await getChannel();
  const videos = await getVisibleVideos();

  return NextResponse.json({
    channelUrl: channel?.channelUrl || '',
    videos: videos.map((v) => ({
      id: v.id,
      youtubeUrl: v.youtubeUrl,
      videoId: v.videoId,
      title: v.title,
      description: v.description || '',
      thumbnailUrl: v.thumbnailUrl || '',
      channelTitle: v.channelTitle || '',
    })),
  });
}
