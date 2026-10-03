import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { listLibraryImages } from '@/lib/media/libraryClient';
import type { LibraryImage, LibraryPage } from '@/lib/media/libraryTypes';
import { hasCatalogImageUrl } from '@/features/catalog/imageUrl';
import { useDialogFocus } from '@/hooks/useDialogFocus';

export default function ImageLibraryPicker({ open, onClose, onAdd, attachedUrls, room, title = 'Add from library' }: {
  open: boolean; onClose: () => void; onAdd: (urls: string[]) => void;
  attachedUrls: string[]; room: number; title?: string;
}) {
  const dialog = useDialogFocus(open, onClose);
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [chosen, setChosen] = useState<Map<number, LibraryImage>>(new Map());
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const generation = useRef(0);

  useEffect(() => {
    if (!open) return;
    setSearchInput(''); setSearch(''); setChosen(new Map());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const run = ++generation.current;
    setImages([]); setPage(0); setError(''); setTotal(null); setHasMore(false); setLoading(true);
    listLibraryImages({ page: 1, perPage: 48, search, includeUsage: false })
      .then(result => { if (generation.current === run) applyPage(result, false); })
      .catch(e => { if (generation.current === run) setError(e instanceof Error ? e.message : 'Library could not be read.'); })
      .finally(() => { if (generation.current === run) setLoading(false); });
    return () => { generation.current += 1; };
  }, [open, search]);

  function applyPage(result: LibraryPage, append: boolean) {
    setImages(current => append ? [...new Map([...current, ...result.images].map(image => [image.id, image])).values()] : result.images);
    setPage(result.page); setTotal(result.total); setHasMore(result.hasMore);
  }
  async function loadMore() {
    if (loading) return;
    const run = generation.current;
    setLoading(true); setError('');
    try {
      const result = await listLibraryImages({ page: page + 1, perPage: 48, search, includeUsage: false });
      if (generation.current === run) applyPage(result, true);
    } catch (e) { if (generation.current === run) setError(e instanceof Error ? e.message : 'More images could not be read.'); }
    finally { if (generation.current === run) setLoading(false); }
  }
  function toggle(image: LibraryImage) {
    setChosen(current => {
      const next = new Map(current);
      if (next.has(image.id)) next.delete(image.id);
      else if (next.size < room) next.set(image.id, image);
      return next;
    });
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-3 sm:p-6" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="Choose images from the library" tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-admin-line bg-admin-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-admin-line px-4 py-3">
          <div><h2 className="text-base font-semibold text-admin-ink">{title}</h2><p className="text-xs text-admin-muted">Browse every library image. Choose up to {room}; files are reused, not uploaded again.</p></div>
          <button type="button" onClick={onClose} aria-label="Close image library" className="rounded-lg p-2 text-admin-muted hover:bg-himalayan-light"><X size={18} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput.trim()); }} className="flex gap-2 border-b border-admin-line px-4 py-3">
          <input aria-label="Search library images" placeholder="Search the full library…" value={searchInput} onChange={e => setSearchInput(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-admin-line bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg border border-admin-line px-3 text-sm text-admin-ink">Search</button>
          {search && <button type="button" onClick={() => { setSearchInput(''); setSearch(''); }} className="text-xs text-himalayan-dark">Clear</button>}
        </form>
        <div className="min-h-[12rem] flex-1 overflow-y-auto p-4" aria-busy={loading}>
          {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" onClick={() => void loadMore()} className="underline">Retry</button></p>}
          {!loading && !error && !images.length && <p className="py-10 text-center text-sm text-admin-muted">{search ? 'No images match this search.' : 'No images in the library yet.'}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {images.map(image => {
              const attached = hasCatalogImageUrl(attachedUrls, image.url);
              const selected = chosen.has(image.id);
              return <button key={image.id} type="button" aria-pressed={selected} aria-label={`${image.title || image.alt || `Image ${image.id}`}${attached ? ', already attached' : ''}`} disabled={attached || (!selected && chosen.size >= room)} onClick={() => toggle(image)} title={image.title || image.alt} className={`relative aspect-square overflow-hidden rounded-xl border-2 ${selected ? 'border-himalayan ring-2 ring-himalayan-light' : 'border-admin-line'} disabled:opacity-45 hover:border-himalayan`}>
                <img src={image.thumbnail || image.url} alt={image.alt || image.title} loading="lazy" className="h-full w-full object-cover" />
                {(selected || attached) && <span className="absolute inset-x-0 bottom-0 bg-himalayan-dark px-1 py-1 text-[10px] font-semibold text-white">{selected ? 'Selected' : 'On product'}</span>}
              </button>;
            })}
          </div>
          {loading && <p role="status" className="py-5 text-center text-sm text-admin-muted">Loading images…</p>}
          {hasMore && <button type="button" disabled={loading} onClick={() => void loadMore()} className="mx-auto mt-4 block rounded-lg border border-admin-line px-4 py-2 text-sm text-admin-ink disabled:opacity-50">Load more images</button>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-admin-line px-4 py-3">
          <span role="status" className="mr-auto text-xs text-admin-muted">{images.length}{total !== null ? ` of ${total}` : ''} shown · {chosen.size} selected</span>
          <button type="button" onClick={onClose} className="rounded-lg border border-admin-line px-3 py-2 text-sm text-admin-ink">Cancel</button>
          <button type="button" disabled={!chosen.size} onClick={() => { onAdd([...chosen.values()].map(image => image.url)); onClose(); }} className="rounded-lg bg-himalayan px-4 py-2 text-sm font-semibold text-white hover:bg-himalayan-dark disabled:opacity-50">Use {chosen.size} image{chosen.size === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
