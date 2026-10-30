'use client';
import { useState, useEffect } from 'react';
import { Play, Video } from 'lucide-react';

interface YouTubeVideo {
  id: string;
  youtubeUrl: string;
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  channelTitle: string;
}

export function YouTubeVideosSection() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelUrl, setChannelUrl] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/storefront/youtube-videos');
        if (res.ok) {
          const data = await res.json();
          setVideos(data.videos || []);
          setChannelUrl(data.channelUrl || '');
        }
      } catch {
        // Silently fail — videos section just won't show
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || videos.length === 0) return null;

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-red-600 font-bold text-sm uppercase tracking-wider">
          <Video className="w-5 h-5" /> Video Library
        </div>
        <h2 className="font-serif text-3xl font-bold text-charcoal">
          Watch & Learn
        </h2>
        <p className="text-charcoal-light max-w-2xl mx-auto">
          Educational videos on Himalayan salt products, livestock nutrition, culinary techniques, and more.
        </p>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((v) => (
          <div
            key={v.id}
            className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 cursor-pointer"
            onClick={() => setSelectedVideo(v)}
          >
            <div className="relative aspect-video bg-gray-100">
              <img
                src={v.thumbnailUrl || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`}
                alt={v.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 ml-0.5" fill="white" />
                </div>
              </div>
            </div>
            <div className="p-4 space-y-1">
              <h3 className="font-semibold text-charcoal text-sm line-clamp-2 leading-tight">{v.title}</h3>
              {v.channelTitle && <p className="text-xs text-charcoal-light">{v.channelTitle}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Channel Link */}
      {channelUrl && (
        <div className="text-center">
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-semibold transition-colors"
          >
            <Video className="w-5 h-5" /> Visit Our YouTube Channel
          </a>
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedVideo(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="relative aspect-video bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1`}
                className="absolute inset-0 w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={selectedVideo.title}
              />
            </div>
            <div className="p-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-charcoal">{selectedVideo.title}</h3>
                {selectedVideo.channelTitle && <p className="text-sm text-charcoal-light mt-1">{selectedVideo.channelTitle}</p>}
                {selectedVideo.description && <p className="text-xs text-charcoal-light mt-2 line-clamp-3">{selectedVideo.description}</p>}
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none shrink-0"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
