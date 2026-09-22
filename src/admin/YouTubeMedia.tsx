'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash, Eye, EyeSlash, YoutubeLogo, Link as LinkIcon,
  ArrowClockwise, MagnifyingGlass, X, CheckCircle, Warning, Globe,
  Play, PencilSimple, FloppyDisk, GearSix,
} from '@phosphor-icons/react';
import { useApp } from '../App';
import { getFreshAccessToken } from '../services/wordpressAdminAuth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YouTubeVideo {
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

interface YouTubeChannel {
  channelId: string;
  channelUrl: string;
  channelTitle: string;
  channelThumbnail: string;
  subscriberCount: string;
  videoCount: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractChannelId(url: string): string | null {
  const patterns = [
    /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function thumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string): Promise<T> {
  const token = await getFreshAccessToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getFreshAccessToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path: string): Promise<void> {
  const token = await getFreshAccessToken();
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// YouTube Media Page
// ---------------------------------------------------------------------------

export function YouTubeMediaPage() {
  const { notify } = useApp();

  // Channel state
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);
  const [channelUrl, setChannelUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Videos state
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Load saved channel + videos
  const loadChannel = useCallback(async () => {
    try {
      const data = await apiGet<{ channel: YouTubeChannel | null; apiKey?: string }>('/api/admin/youtube/channel');
      if (data.channel) setChannel(data.channel);
      if (data.apiKey) setApiKey(data.apiKey);
    } catch { /* not configured yet */ }
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ videos: YouTubeVideo[] }>('/api/admin/youtube/videos');
      setVideos(data.videos || []);
    } catch (err) {
      notify(`Could not load videos: ${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadChannel();
    void loadVideos();
  }, [loadChannel, loadVideos]);

  // Connect channel
  const connectChannel = async () => {
    if (!channelUrl.trim()) { notify('Enter a YouTube channel URL', 'error'); return; }
    setChannelLoading(true);
    try {
      const data = await apiPost<{ channel: YouTubeChannel }>('/api/admin/youtube/channel', {
        channelUrl: channelUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });
      setChannel(data.channel);
      notify(`Connected: ${data.channel.channelTitle}`);
    } catch (err) {
      notify(`Could not connect channel: ${(err as Error).message}`, 'error');
    } finally {
      setChannelLoading(false);
    }
  };

  const disconnectChannel = async () => {
    if (!window.confirm('Disconnect this YouTube channel? Videos will be kept.')) return;
    try {
      await apiDelete('/api/admin/youtube/channel');
      setChannel(null);
      setChannelUrl('');
      notify('Channel disconnected');
    } catch (err) {
      notify(`Could not disconnect: ${(err as Error).message}`, 'error');
    }
  };

  // Add video
  const addVideo = async () => {
    const videoId = extractVideoId(addUrl.trim());
    if (!videoId) { notify('Invalid YouTube URL', 'error'); return; }
    setAddLoading(true);
    try {
      const data = await apiPost<{ video: YouTubeVideo }>('/api/admin/youtube/videos', {
        videoId,
        youtubeUrl: addUrl.trim(),
      });
      setVideos((prev) => [data.video, ...prev]);
      setAddUrl('');
      notify(`Added: ${data.video.title}`);
    } catch (err) {
      notify(`Could not add video: ${(err as Error).message}`, 'error');
    } finally {
      setAddLoading(false);
    }
  };

  // Toggle visibility
  const toggleVisibility = async (v: YouTubeVideo) => {
    try {
      const data = await apiPost<{ video: YouTubeVideo }>(`/api/admin/youtube/videos/${v.id}`, {
        showOnStorefront: !v.showOnStorefront,
      });
      setVideos((prev) => prev.map((x) => x.id === v.id ? data.video : x));
      notify(data.video.showOnStorefront ? 'Shown on storefront' : 'Hidden from storefront');
    } catch (err) {
      notify(`Could not update: ${(err as Error).message}`, 'error');
    }
  };

  // Save edit
  const saveEdit = async (v: YouTubeVideo) => {
    try {
      const data = await apiPost<{ video: YouTubeVideo }>(`/api/admin/youtube/videos/${v.id}`, {
        title: editTitle,
        description: editDesc,
      });
      setVideos((prev) => prev.map((x) => x.id === v.id ? data.video : x));
      setEditingId(null);
      notify('Video updated');
    } catch (err) {
      notify(`Could not update: ${(err as Error).message}`, 'error');
    }
  };

  // Delete video
  const deleteVideo = async (v: YouTubeVideo) => {
    if (!window.confirm(`Delete "${v.title}"?`)) return;
    try {
      await apiDelete(`/api/admin/youtube/videos/${v.id}`);
      setVideos((prev) => prev.filter((x) => x.id !== v.id));
      notify('Video deleted');
    } catch (err) {
      notify(`Could not delete: ${(err as Error).message}`, 'error');
    }
  };

  // Filtered + searched videos
  const filtered = videos.filter((v) => {
    if (filter === 'visible' && !v.showOnStorefront) return false;
    if (filter === 'hidden' && v.showOnStorefront) return false;
    if (search) {
      const needle = search.toLowerCase();
      return v.title.toLowerCase().includes(needle) || v.description.toLowerCase().includes(needle) || v.channelTitle.toLowerCase().includes(needle);
    }
    return true;
  });

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <YoutubeLogo size={28} className="text-red-500" /> YouTube Media
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage YouTube videos and channel for the storefront</p>
        </div>
      </div>

      {/* ── Channel Setup ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <GearSix size={16} /> YouTube Channel
        </h2>
        {channel ? (
          <div className="flex items-center gap-4">
            {channel.channelThumbnail && (
              <img src={channel.channelThumbnail} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-red-200" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{channel.channelTitle}</p>
              <p className="text-xs text-gray-500">
                {channel.subscriberCount} subscribers · {channel.videoCount} videos
              </p>
              <a href={channel.channelUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                <LinkIcon size={10} /> {channel.channelUrl}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full flex items-center gap-1">
                <CheckCircle size={12} /> Connected
              </span>
              <button onClick={() => void disconnectChannel()} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200">
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Channel URL</label>
                <input
                  value={channelUrl}
                  onChange={(e) => setChannelUrl(e.target.value)}
                  placeholder="https://youtube.com/@himalayankoh"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  YouTube Data API Key <span className="text-gray-400">(optional, for auto-fetch)</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showApiKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => void connectChannel()}
              disabled={channelLoading || !channelUrl.trim()}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2"
            >
              {channelLoading ? 'Connecting…' : <><YoutubeLogo size={16} /> Connect Channel</>}
            </button>
            <p className="text-[11px] text-gray-400">
              API key is stored server-side only and never exposed to the browser. Get yours from{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a>.
            </p>
          </div>
        )}
      </div>

      {/* ── Add Video ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plus size={16} /> Add Video
        </h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addVideo(); }}
              placeholder="Paste YouTube URL (e.g., https://youtube.com/watch?v=...)"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={() => void addVideo()}
            disabled={addLoading || !addUrl.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center gap-2 shrink-0"
          >
            {addLoading ? 'Adding…' : <><Plus size={14} /> Add Video</>}
          </button>
        </div>
      </div>

      {/* ── Video Library ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <Play size={16} /> Video Library
            <span className="text-gray-400 font-normal">({filtered.length})</span>
          </h2>
          <div className="flex-1" />
          <div className="relative">
            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-400 w-48"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
          >
            <option value="all">All</option>
            <option value="visible">Visible on Storefront</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Loading videos…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            {videos.length === 0 ? 'No videos added yet. Paste a YouTube URL above to get started.' : 'No videos match your filter.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
            {filtered.map((v) => (
              <div key={v.id} className="group border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                {/* Thumbnail */}
                <div className="relative aspect-video bg-gray-100">
                  <img
                    src={v.thumbnailUrl || thumbnailUrl(v.videoId)}
                    alt={v.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <a
                      href={v.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-10 h-10 flex items-center justify-center"
                    >
                      <Play size={18} weight="fill" />
                    </a>
                  </div>
                  {v.duration && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                      {v.duration}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  {editingId === v.id ? (
                    <div className="space-y-2">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                        placeholder="Title"
                      />
                      <textarea
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full px-2 py-1 border border-blue-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-200 resize-none"
                        rows={2}
                        placeholder="Description"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => void saveEdit(v)} className="px-2 py-1 bg-green-500 text-white text-[11px] rounded flex items-center gap-1"><FloppyDisk size={10} /> Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 border text-[11px] rounded text-gray-500">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight" title={v.title}>{v.title}</p>
                      <p className="text-[10px] text-gray-400 line-clamp-2">{v.description || 'No description'}</p>
                      {v.channelTitle && <p className="text-[10px] text-gray-500">{v.channelTitle}</p>}
                    </>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                    <button
                      onClick={() => void toggleVisibility(v)}
                      className={`px-2 py-1 text-[10px] font-semibold rounded flex items-center gap-1 transition-colors ${
                        v.showOnStorefront ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {v.showOnStorefront ? <><Eye size={10} /> Visible</> : <><EyeSlash size={10} /> Hidden</>}
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => { setEditingId(v.id); setEditTitle(v.title); setEditDesc(v.description); }}
                      className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <PencilSimple size={12} />
                    </button>
                    <button
                      onClick={() => void deleteVideo(v)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
