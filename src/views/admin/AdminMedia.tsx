'use client';

/**
 * `/admin/media` — the store's media, in two tabs.
 *
 * **Images** is the image library (default): every product photo the catalogue
 * holds plus anything uploaded or imported here, all WordPress Media Library
 * attachments.
 *
 * **Videos** is the existing media hub, unchanged — it manages the YouTube-backed
 * video records that publish to `/media`, and removing it because the page gained
 * an image library would have thrown away working functionality.
 */

import { useState } from 'react';
import { Images, Play } from '@phosphor-icons/react';
import MediaManager from '../../admin/MediaManager';
import ImageLibrary from '../../admin/ImageLibrary';

type Tab = 'images' | 'videos';

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'images', label: 'Images', hint: 'Product photos and uploads' },
  { key: 'videos', label: 'Videos', hint: 'YouTube media hub' },
];

export default function AdminMediaView() {
  const [tab, setTab] = useState<Tab>('images');

  return (
    <div className="w-full space-y-4">
      <div role="tablist" aria-label="Media type" className="inline-flex gap-1 rounded-xl border border-[#E0D6C8] bg-white p-1">
        {TABS.map((entry) => {
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                active ? 'bg-[#26211C] text-white' : 'text-[#6D6258] hover:bg-[#FAF7F1]'
              }`}
            >
              {entry.key === 'images' ? <Images size={16} weight={active ? 'fill' : 'regular'} /> : <Play size={16} weight={active ? 'fill' : 'regular'} />}
              {entry.label}
              <span className={`hidden text-[11px] font-normal sm:inline ${active ? 'text-white/60' : 'text-[#6D6258]/70'}`}>
                {entry.hint}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'images' ? <ImageLibrary /> : <MediaManager />}
    </div>
  );
}
