/**
 * YouTube Media storage — uses WordPress options API instead of Supabase.
 *
 * Data is stored as JSON in a single WordPress option:
 *   himalayan_koh_youtube → { channel: {...}, videos: [...] }
 *
 * This avoids needing a Supabase table while keeping data in the existing
 * WordPress database.
 */

import { wordpressRequest, wordpressRequestSafe } from '../backend/wordpress';
import { wooCredentials } from '../backend/credentials';

export interface YouTubeChannel {
  channelId: string;
  channelUrl: string;
  channelTitle: string;
  channelThumbnail: string;
  subscriberCount: string;
  videoCount: string;
}

export interface YouTubeVideo {
  id: string;
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  showOnStorefront: boolean;
  sortOrder: number;
  createdAt: string;
}

interface YouTubeStoreData {
  channel: YouTubeChannel | null;
  channelApiKey: string | null;
  videos: YouTubeVideo[];
}

const OPTION_KEY = 'himalayan_koh_youtube';

// Default empty state
const EMPTY: YouTubeStoreData = {
  channel: null,
  channelApiKey: null,
  videos: [],
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function loadYouTubeData(): Promise<YouTubeStoreData> {
  try {
    const res = await wordpressRequestSafe<Record<string, unknown>>('/wp/v2/settings', {
      useCredentials: true,
    });
    if (res && typeof res === 'object') {
      const raw = (res as Record<string, unknown>)[OPTION_KEY];
      if (typeof raw === 'string') {
        return JSON.parse(raw) as YouTubeStoreData;
      }
      if (typeof raw === 'object' && raw !== null) {
        return raw as YouTubeStoreData;
      }
    }
  } catch {
    // Settings endpoint might not be available; try option via custom endpoint
  }

  // Fallback: read from a custom WP REST endpoint
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL || ''}/wp-json/himalayan/v1/youtube`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch { /* not available */ }

  return EMPTY;
}

export async function saveYouTubeData(data: YouTubeStoreData): Promise<void> {
  // Try WP settings API first
  try {
    await wordpressRequest('/wp/v2/settings', {
      method: 'POST',
      useCredentials: true,
      body: { [OPTION_KEY]: JSON.stringify(data) },
    });
    return;
  } catch { /* settings endpoint might not work */ }

  // Fallback: try custom endpoint
  try {
    const creds = wooCredentials();
    const token = creds
      ? Buffer.from(`${creds.username}:${creds.password}`).toString('base64')
      : '';

    await fetch(
      `${process.env.NEXT_PUBLIC_WORDPRESS_BASE_URL || ''}/wp-json/himalayan/v1/youtube`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Basic ${token}` } : {}),
        },
        body: JSON.stringify(data),
      }
    );
  } catch {
    throw new Error('Could not save YouTube data to WordPress. Check WordPress credentials.');
  }
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

export async function getChannel(): Promise<YouTubeChannel | null> {
  const data = await loadYouTubeData();
  return data.channel;
}

export async function getChannelApiKey(): Promise<string | null> {
  const data = await loadYouTubeData();
  return data.channelApiKey;
}

export async function saveChannel(channel: YouTubeChannel, apiKey?: string): Promise<void> {
  const data = await loadYouTubeData();
  data.channel = channel;
  if (apiKey !== undefined) data.channelApiKey = apiKey;
  await saveYouTubeData(data);
}

export async function deleteChannel(): Promise<void> {
  const data = await loadYouTubeData();
  data.channel = null;
  data.channelApiKey = null;
  await saveYouTubeData(data);
}

// ---------------------------------------------------------------------------
// Video helpers
// ---------------------------------------------------------------------------

export async function getVideos(): Promise<YouTubeVideo[]> {
  const data = await loadYouTubeData();
  return data.videos.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getVideo(id: string): Promise<YouTubeVideo | undefined> {
  const videos = await getVideos();
  return videos.find((v) => v.id === id);
}

export async function addVideo(video: YouTubeVideo): Promise<YouTubeVideo> {
  const data = await loadYouTubeData();
  // Check duplicate
  if (data.videos.some((v) => v.videoId === video.videoId)) {
    throw new Error('This video is already in your library');
  }
  video.sortOrder = data.videos.length;
  data.videos.push(video);
  await saveYouTubeData(data);
  return video;
}

export async function updateVideo(id: string, updates: Partial<YouTubeVideo>): Promise<YouTubeVideo> {
  const data = await loadYouTubeData();
  const idx = data.videos.findIndex((v) => v.id === id);
  if (idx === -1) throw new Error('Video not found');
  data.videos[idx] = { ...data.videos[idx], ...updates };
  await saveYouTubeData(data);
  return data.videos[idx];
}

export async function deleteVideo(id: string): Promise<void> {
  const data = await loadYouTubeData();
  data.videos = data.videos.filter((v) => v.id !== id);
  await saveYouTubeData(data);
}

export async function getVisibleVideos(): Promise<YouTubeVideo[]> {
  const videos = await getVideos();
  return videos.filter((v) => v.showOnStorefront);
}
