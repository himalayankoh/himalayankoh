'use client';

/**
 * The store's image library.
 *
 * One place that answers "what images does this store have?" — the product photos
 * that came in with the catalogue, and anything the owner uploads or imports here.
 * Both are WordPress Media Library attachments, which is also what WooCommerce
 * renders, so the library and the shop can never disagree about what exists.
 *
 * Deleting is deliberately narrow: an image a product still renders is refused by
 * the API route, and this UI shows which images are in use rather than hiding them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowSquareOut,
  CheckCircle,
  CheckSquare,
  CloudArrowUp,
  Copy,
  Images,
  ImageSquare,
  LinkSimple,
  MagnifyingGlass,
  PencilLine,
  SpinnerGap,
  Square,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { useApp } from '../App';
import {
  deleteLibraryImage,
  importLibraryImageFromUrl,
  listLibraryImages,
  updateLibraryImage,
  uploadLibraryImage,
} from '../lib/media/libraryClient';
import type { LibraryImage } from '../lib/media/libraryTypes';

const PER_PAGE = 60;

type FilterKey = 'all' | 'products' | 'unused' | 'no-alt';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All images' },
  { key: 'products', label: 'In products' },
  { key: 'unused', label: 'Not in a product' },
  { key: 'no-alt', label: 'Missing alt text' },
];

const INK = '#26211C';
const MUTED = '#6D6258';
const BORDER = '#E0D6C8';
const PARCHMENT = '#FAF7F1';
const GOLD = '#9a6f16';
const GREEN = '#3F6550';
const AMBER = '#B86452';

function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function displayName(image: LibraryImage): string {
  return image.title || image.url.split('/').pop() || `Image ${image.id}`;
}

export default function ImageLibrary() {
  const { notify } = useApp();

  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<LibraryImage | null>(null);
  const [altDraft, setAltDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const [uploading, setUploading] = useState<{ done: number; total: number; current: string } | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  /** Search is debounced so typing does not fire a WordPress read per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (options: { append?: boolean; page?: number; silent?: boolean } = {}) => {
      const targetPage = options.page ?? 1;
      if (options.append) setLoadingMore(true);
      else if (!options.silent) setLoading(true);

      try {
        const result = await listLibraryImages({ page: targetPage, perPage: PER_PAGE, search: query });
        setImages((current) =>
          options.append && current ? [...current, ...result.images] : result.images
        );
        setPage(result.page);
        setHasMore(result.hasMore);
        setLoadError(null);
      } catch (error) {
        setLoadError((error as Error).message || 'The image library could not be read.');
        if (!options.append) setImages([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query]
  );

  useEffect(() => {
    void load();
    setSelected(new Set());
  }, [load]);

  /** Escape closes the detail panel — it is a modal, so the key has to work. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openImage = (image: LibraryImage) => {
    setOpen(image);
    setAltDraft(image.alt);
    setTitleDraft(image.title);
  };

  // --- uploads -------------------------------------------------------------

  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/'));
      const skipped = files.length - images.length;
      if (skipped > 0) notify(`${skipped} file${skipped === 1 ? '' : 's'} skipped — images only.`, 'error');
      if (images.length === 0) return;

      setUploading({ done: 0, total: images.length, current: images[0].name });
      let uploaded = 0;
      const failures: string[] = [];

      for (const file of images) {
        setUploading({ done: uploaded, total: images.length, current: file.name });
        try {
          await uploadLibraryImage(file);
          uploaded += 1;
        } catch (error) {
          failures.push((error as Error).message);
        }
      }

      setUploading(null);

      if (uploaded > 0) {
        notify(`Added ${uploaded} image${uploaded === 1 ? '' : 's'} to the library.`);
        await load({ silent: true });
      }
      if (failures.length > 0) {
        notify(failures[0], 'error');
      }
    },
    [load, notify]
  );

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) void upload(files);
  };

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      await importLibraryImageFromUrl(url);
      notify('Image imported into the library.');
      setImportUrl('');
      await load({ silent: true });
    } catch (error) {
      notify((error as Error).message || 'That image could not be imported.', 'error');
    } finally {
      setImporting(false);
    }
  };

  // --- editing and deleting ------------------------------------------------

  const saveDetails = async () => {
    if (!open) return;
    setSaving(true);
    try {
      await updateLibraryImage({ id: open.id, altText: altDraft, title: titleDraft });
      setImages((current) =>
        (current ?? []).map((image) =>
          image.id === open.id ? { ...image, alt: altDraft.trim(), title: titleDraft.trim() } : image
        )
      );
      setOpen({ ...open, alt: altDraft.trim(), title: titleDraft.trim() });
      notify('Saved.');
    } catch (error) {
      notify((error as Error).message || 'The image could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmList = useMemo(
    () => (confirmIds ?? []).map((id) => (images ?? []).find((image) => image.id === id)).filter(Boolean) as LibraryImage[],
    [confirmIds, images]
  );

  const runDelete = async () => {
    const ids = confirmIds ?? [];
    // In-use images are refused by the server; filtering here keeps the operation
    // honest about what it will actually do.
    const deletable = confirmList.filter((image) => image.usedBy.length === 0).map((image) => image.id);
    const skipped = ids.length - deletable.length;
    if (deletable.length === 0) {
      notify('Nothing deleted — every selected image is used by a product.', 'error');
      setConfirmIds(null);
      return;
    }

    setDeleting(true);
    let removed = 0;
    const failures: string[] = [];
    for (const id of deletable) {
      try {
        await deleteLibraryImage(id);
        removed += 1;
      } catch (error) {
        failures.push((error as Error).message);
      }
    }
    setDeleting(false);
    setConfirmIds(null);
    setOpen(null);
    setSelected(new Set());

    if (removed > 0) {
      notify(
        `Deleted ${removed} image${removed === 1 ? '' : 's'}.` +
          (skipped > 0 ? ` ${skipped} skipped — still used by a product.` : '')
      );
      await load({ silent: true });
    }
    if (failures.length > 0) notify(failures[0], 'error');
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      notify('Image URL copied.');
    } catch {
      notify('The browser refused clipboard access — open the image and copy from the address bar.', 'error');
    }
  };

  // --- derived -------------------------------------------------------------

  const counts = useMemo(() => {
    const list = images ?? [];
    return {
      total: list.length,
      inUse: list.filter((image) => image.usedBy.length > 0).length,
      missingAlt: list.filter((image) => !image.alt).length,
    };
  }, [images]);

  const visible = useMemo(() => {
    const list = images ?? [];
    if (filter === 'products') return list.filter((image) => image.usedBy.length > 0);
    if (filter === 'unused') return list.filter((image) => image.usedBy.length === 0);
    if (filter === 'no-alt') return list.filter((image) => !image.alt);
    return list;
  }, [images, filter]);

  const toggleSelected = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((image) => selected.has(image.id));
  const selectedInUse = useMemo(
    () => (images ?? []).filter((image) => selected.has(image.id) && image.usedBy.length > 0).length,
    [images, selected]
  );

  // --- render --------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* Header */}
      <div
        className="rounded-2xl border p-5 shadow-sm"
        style={{ borderColor: BORDER, background: `linear-gradient(135deg, ${PARCHMENT} 0%, #fff 70%)` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${INK})` }}
              >
                <Images size={20} weight="fill" />
              </span>
              <div>
                <h1 className="text-xl font-bold" style={{ color: INK }}>
                  Image Library
                </h1>
                <p className="text-xs" style={{ color: MUTED }}>
                  Every image the store holds — product photos included — stored in WordPress media.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length > 0) void upload(files);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading !== null}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60"
              style={{ background: GOLD }}
            >
              {uploading ? <SpinnerGap size={16} className="animate-spin" /> : <CloudArrowUp size={16} weight="bold" />}
              {uploading ? `Uploading ${uploading.done + 1}/${uploading.total}…` : 'Upload images'}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
          {[
            { label: 'Loaded', value: counts.total, color: INK },
            { label: 'In products', value: counts.inUse, color: GREEN },
            { label: 'Missing alt text', value: counts.missingAlt, color: counts.missingAlt > 0 ? AMBER : GREEN },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-white/70 px-3 py-2" style={{ borderColor: BORDER }}>
              <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                {stat.label}
              </dt>
              <dd className="text-lg font-bold leading-tight" style={{ color: stat.color }}>
                {images === null ? '—' : stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3" style={{ borderColor: BORDER }}>
        <div className="relative min-w-[12rem] flex-1">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: MUTED }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search file names and titles…"
            aria-label="Search the image library"
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: BORDER, color: INK }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1"
              style={{ color: MUTED }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((entry) => {
            const active = filter === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                aria-pressed={active}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                style={{
                  borderColor: active ? GOLD : BORDER,
                  background: active ? 'rgba(154,111,22,0.10)' : '#fff',
                  color: active ? GOLD : MUTED,
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        {visible.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelected(allVisibleSelected ? new Set() : new Set(visible.map((image) => image.id)))
            }
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: BORDER, color: MUTED }}
          >
            {allVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />}
            {allVisibleSelected ? 'Clear selection' : 'Select shown'}
          </button>
        )}
      </div>

      {/* Import from URL */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3" style={{ borderColor: BORDER }}>
        <LinkSimple size={16} style={{ color: GOLD }} />
        <input
          value={importUrl}
          onChange={(event) => setImportUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void importFromUrl();
          }}
          placeholder="Paste an image URL to copy it into the library"
          aria-label="Import image from URL"
          className="min-w-[12rem] flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          style={{ borderColor: BORDER, color: INK }}
        />
        <button
          type="button"
          onClick={() => void importFromUrl()}
          disabled={importing || !importUrl.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: BORDER, color: INK }}
        >
          {importing ? <SpinnerGap size={14} className="animate-spin" /> : <CloudArrowUp size={14} />}
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>

      {loadError && (
        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: '#f0c9b8', background: '#fdf3ef', color: '#8a3a22' }}
        >
          <span className="flex items-center gap-2">
            <WarningCircle size={16} weight="fill" /> {loadError}
          </span>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            className="rounded-lg border px-3 py-1 text-xs font-semibold"
            style={{ borderColor: '#e3b4a0', color: '#8a3a22' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid (also the drop target) */}
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={onDrop}
        className="relative rounded-2xl border-2 border-dashed p-3 transition"
        style={{
          borderColor: dragging ? GOLD : 'transparent',
          background: dragging ? 'rgba(154,111,22,0.06)' : 'transparent',
        }}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/70">
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: GOLD }}>
              <CloudArrowUp size={18} weight="bold" /> Drop images to upload
            </p>
          </div>
        )}

        {images === null || loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-xl border"
                style={{ borderColor: BORDER, background: PARCHMENT }}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <ImageSquare size={30} className="mx-auto" style={{ color: BORDER }} />
            <p className="mt-3 text-sm font-semibold" style={{ color: INK }}>
              {images.length === 0
                ? 'No images in the library yet.'
                : 'No images match this filter.'}
            </p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>
              {images.length === 0
                ? 'Upload from your device, paste an image URL, or import a product — its photos land here.'
                : 'Try “All images”, or clear the search.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {visible.map((image) => {
              const isSelected = selected.has(image.id);
              const inUse = image.usedBy.length > 0;
              return (
                <figure
                  key={image.id}
                  className="group relative aspect-square overflow-hidden rounded-xl border bg-white"
                  style={{ borderColor: isSelected ? GOLD : BORDER }}
                >
                  <button
                    type="button"
                    onClick={() => openImage(image)}
                    className="block h-full w-full"
                    aria-label={`Open ${displayName(image)}`}
                  >
                    <img
                      src={image.thumbnail || image.url}
                      alt={image.alt || displayName(image)}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSelected(image.id)}
                    aria-label={isSelected ? 'Deselect image' : 'Select image'}
                    aria-pressed={isSelected}
                    className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border bg-white/90 backdrop-blur transition"
                    style={{ borderColor: isSelected ? GOLD : BORDER, color: isSelected ? GOLD : MUTED }}
                  >
                    {isSelected ? <CheckSquare size={15} weight="fill" /> : <Square size={15} />}
                  </button>

                  <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
                    {inUse && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ background: GREEN }}
                      >
                        In {image.usedBy.length} product{image.usedBy.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {!image.alt && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                        style={{ background: AMBER }}
                      >
                        No alt
                      </span>
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/85 via-black/55 to-transparent p-2 transition-transform duration-200 group-hover:translate-y-0 group-focus-within:translate-y-0">
                    <p className="truncate text-[11px] font-medium text-white/95">{displayName(image)}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copyUrl(image.url)}
                        title="Copy image URL"
                        aria-label="Copy image URL"
                        className="rounded-md p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openImage(image)}
                        title="Edit details"
                        aria-label="Edit details"
                        className="rounded-md p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                      >
                        <PencilLine size={13} />
                      </button>
                      <a
                        href={image.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open the original file"
                        aria-label="Open the original file"
                        className="rounded-md p-1.5 text-white/85 hover:bg-white/15 hover:text-white"
                      >
                        <ArrowSquareOut size={13} />
                      </a>
                      <button
                        type="button"
                        onClick={() => setConfirmIds([image.id])}
                        disabled={inUse}
                        title={inUse ? 'Used by a product — remove it from the product first' : 'Delete'}
                        aria-label="Delete image"
                        className="ml-auto rounded-md p-1.5 text-white/85 hover:bg-red-500/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  </div>
                </figure>
              );
            })}
          </div>
        )}

        {hasMore && images !== null && !loading && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => void load({ append: true, page: page + 1 })}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: BORDER, color: INK }}
            >
              {loadingMore ? <SpinnerGap size={14} className="animate-spin" /> : null}
              {loadingMore ? 'Loading…' : 'Load more images'}
            </button>
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div
          className="sticky bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 shadow-lg"
          style={{ borderColor: BORDER, background: 'rgba(255,255,255,0.97)' }}
        >
          <span className="text-sm font-semibold" style={{ color: INK }}>
            {selected.size} selected
            {selectedInUse > 0 && (
              <span className="ml-2 text-xs font-normal" style={{ color: MUTED }}>
                · {selectedInUse} in use by products
              </span>
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const urls = (images ?? [])
                  .filter((image) => selected.has(image.id))
                  .map((image) => image.url)
                  .join('\n');
                void navigator.clipboard
                  .writeText(urls)
                  .then(() => notify('Image URLs copied.'))
                  .catch(() => notify('The browser refused clipboard access.', 'error'));
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: BORDER, color: INK }}
            >
              <Copy size={13} /> Copy URLs
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: BORDER, color: MUTED }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmIds(Array.from(selected))}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: '#B23B24' }}
            >
              <Trash size={13} /> Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Image details for ${displayName(open)}`}
        >
          <div className="grid max-h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[1.55fr_1fr]">
            <div className="flex min-h-[16rem] items-center justify-center bg-[#171310] p-4">
              <img
                src={open.url}
                alt={open.alt || displayName(open)}
                className="max-h-[46vh] w-auto max-w-full rounded-lg object-contain lg:max-h-[74vh]"
              />
            </div>

            <aside className="flex max-h-[74vh] flex-col overflow-y-auto p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold" style={{ color: INK }}>
                    {displayName(open)}
                  </h2>
                  <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
                    #{open.id}
                    {open.width && open.height ? ` · ${open.width}×${open.height}` : ''}
                    {formatBytes(open.bytes) ? ` · ${formatBytes(open.bytes)}` : ''}
                    {open.date ? ` · ${new Date(open.date).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  aria-label="Close"
                  className="rounded-lg border p-1.5"
                  style={{ borderColor: BORDER, color: MUTED }}
                >
                  <X size={15} />
                </button>
              </div>

              {open.usedBy.length > 0 ? (
                <div className="mt-4 rounded-xl border p-3" style={{ borderColor: BORDER, background: PARCHMENT }}>
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: GREEN }}>
                    <CheckCircle size={13} weight="fill" /> Used by {open.usedBy.length} product
                    {open.usedBy.length === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {open.usedBy.map((usage) => (
                      <li key={usage.id}>
                        <Link
                          to={`/admin/products/edit/${usage.id}`}
                          className="flex items-center gap-1.5 text-xs font-semibold underline-offset-2 hover:underline"
                          style={{ color: INK }}
                        >
                          {usage.name}
                          {usage.isPrimary && (
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: GOLD }}>
                              main photo
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border px-3 py-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                  No product renders this image. It is safe to delete.
                </p>
              )}

              <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                Title
              </label>
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: BORDER, color: INK }}
              />

              <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                Alt text
              </label>
              <textarea
                value={altDraft}
                onChange={(event) => setAltDraft(event.target.value)}
                rows={3}
                placeholder="Describe the image for screen readers and search engines"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: BORDER, color: INK }}
              />
              {!open.alt && (
                <p className="mt-1 text-[11px]" style={{ color: AMBER }}>
                  This image has no alt text — the storefront renders it with none.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: GOLD }}
                >
                  {saving ? <SpinnerGap size={14} className="animate-spin" /> : null}
                  {saving ? 'Saving…' : 'Save details'}
                </button>
                <button
                  type="button"
                  onClick={() => void copyUrl(open.url)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <Copy size={14} /> Copy URL
                </button>
                <a
                  href={open.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <ArrowSquareOut size={14} /> Original
                </a>
                <button
                  type="button"
                  onClick={() => setConfirmIds([open.id])}
                  disabled={open.usedBy.length > 0}
                  title={open.usedBy.length > 0 ? 'Remove it from its product first' : 'Delete this image'}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ borderColor: '#e3b4a0', color: '#B23B24' }}
                >
                  <Trash size={14} /> Delete
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmIds && confirmIds.length > 0 && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold" style={{ color: INK }}>
              Delete {confirmIds.length} image{confirmIds.length === 1 ? '' : 's'}?
            </h3>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              The file is removed from the WordPress media library. This cannot be undone.
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border p-3" style={{ borderColor: BORDER }}>
              {confirmList.map((image) => (
                <li key={image.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" style={{ color: INK }}>
                    {displayName(image)}
                  </span>
                  {image.usedBy.length > 0 && (
                    <span className="shrink-0 font-semibold" style={{ color: AMBER }}>
                      in use — will be skipped
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmIds(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: BORDER, color: INK }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: '#B23B24' }}
              >
                {deleting ? <SpinnerGap size={14} className="animate-spin" /> : <Trash size={14} />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
