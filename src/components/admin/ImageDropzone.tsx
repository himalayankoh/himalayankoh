import { useRef, useState } from 'react';
import { AlertCircle, GripVertical, Image as ImageIcon, Loader2, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import { MAX_PRODUCT_IMAGES } from '../../lib/images/productImageConstants';
import type { AdminProductImage } from './productImageTypes';
import { AdminChip } from './AdminUI';

interface ImageDropzoneProps {
  images: AdminProductImage[];
  thumbnail: string;
  uploading?: boolean;
  uploadProgress?: { completed: number; total: number };
  validationMessage?: string;
  onUpload: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string, file: File) => void;
  onRetry: (id: string) => void;
  onSetThumbnail: (url: string) => void;
  onReorder: (images: AdminProductImage[]) => void;
  onEdit: (image: AdminProductImage) => void;
}

export default function ImageDropzone({
  images,
  thumbnail,
  uploading,
  uploadProgress,
  validationMessage,
  onUpload,
  onRemove,
  onReplace,
  onRetry,
  onSetThumbnail,
  onReorder,
  onEdit,
}: ImageDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const slotsRemaining = Math.max(0, MAX_PRODUCT_IMAGES - images.length);
  const canAddMore = slotsRemaining > 0 && !uploading;

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (!canAddMore) return;
    if (event.dataTransfer.files?.length) {
      onUpload(event.dataTransfer.files);
    }
  };

  const handleReorderDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...images];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onReorder(next);
    setDragIndex(null);
  };

  const openReplacePicker = (imageId: string) => {
    setReplaceTargetId(imageId);
    replaceInputRef.current?.click();
  };

  const handleReplaceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !replaceTargetId) return;
    onReplace(replaceTargetId, file);
    setReplaceTargetId(null);
  };

  const resolveThumbnailUrl = (image: AdminProductImage) =>
    image.storageUrl || image.previewUrl;

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => {
          onUpload(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleReplaceChange}
        className="hidden"
      />

      <div className="flex items-center justify-between gap-2 text-sm text-admin-muted">
        <span>
          {images.length} / {MAX_PRODUCT_IMAGES} images
        </span>
        {slotsRemaining > 0 ? (
          <span>
            {slotsRemaining} slot{slotsRemaining === 1 ? '' : 's'} remaining
          </span>
        ) : (
          <AdminChip tone="warning">Maximum reached</AdminChip>
        )}
      </div>

      {validationMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{validationMessage}</p>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (canAddMore) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => canAddMore && fileInputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          canAddMore ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        } ${
          dragOver
            ? 'border-himalayan bg-himalayan-lighter'
            : 'border-admin-line hover:border-himalayan/50 hover:bg-admin-canvas/60'
        }`}
      >
        {uploading ? (
          <div className="space-y-2">
            <Loader2 size={32} className="mx-auto animate-spin text-himalayan" />
            <p className="font-medium text-admin-ink">Uploading images…</p>
            {uploadProgress && uploadProgress.total > 0 && (
              <p className="text-sm text-admin-muted">
                {uploadProgress.completed} of {uploadProgress.total} complete
              </p>
            )}
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto mb-2 text-admin-muted/60" />
            <p className="font-medium text-admin-ink">Drag and drop, or click to add images</p>
            <p className="mt-1 text-sm text-admin-muted">
              JPG, PNG, WebP, GIF · up to 5 MB each · max {MAX_PRODUCT_IMAGES} images
            </p>
          </>
        )}
      </div>

      {images.length > 0 && (
        /* A fixed three-column grid: the console keeps its desktop layout at
           every viewport instead of restacking. */
        <div className="grid grid-cols-3 gap-4">
          {images.map((image, index) => {
            const displayUrl = image.previewUrl;
            const persistedUrl = resolveThumbnailUrl(image);
            const isThumbnail = thumbnail === persistedUrl || thumbnail === displayUrl;
            const isBusy = image.status === 'uploading';
            const hasError = image.status === 'error';

            return (
              <div
                key={image.id}
                draggable={!isBusy}
                onDragStart={() => !isBusy && setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleReorderDrop(index);
                }}
                className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-admin-canvas ${
                  isThumbnail ? 'border-himalayan' : hasError ? 'border-red-300' : 'border-admin-line'
                } ${dragIndex === index ? 'opacity-60' : ''}`}
              >
                <div className="absolute left-2 top-2 z-10 cursor-grab rounded-md bg-admin-surface/90 p-1 active:cursor-grabbing">
                  <GripVertical size={14} className="text-admin-muted" />
                </div>

                <img
                  src={displayUrl}
                  alt={`Product ${index + 1}`}
                  className={`w-full h-full object-cover ${isBusy ? 'opacity-70' : ''}`}
                />

                {isBusy && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-admin-surface/75">
                    <Loader2 size={20} className="animate-spin text-himalayan" />
                    <span className="text-xs font-medium text-admin-ink">Uploading…</span>
                  </div>
                )}

                {hasError && (
                  <div className="absolute inset-x-0 bottom-0 line-clamp-2 bg-red-600/90 px-2 py-1.5 text-[11px] text-white">
                    {image.error || 'Upload failed'}
                  </div>
                )}

                {!hasError && !isBusy && image.optimization && (
                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[11px] text-white transition-opacity group-hover:opacity-0">
                    {image.optimization}
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(image);
                    }}
                    disabled={isBusy}
                    className="rounded-lg bg-admin-surface p-2 text-admin-ink transition-colors hover:bg-admin-canvas disabled:opacity-40"
                    title="Edit image"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetThumbnail(persistedUrl);
                    }}
                    disabled={isBusy}
                    className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                      isThumbnail
                        ? 'bg-himalayan text-white'
                        : 'bg-admin-surface text-admin-ink hover:bg-admin-canvas'
                    }`}
                    title="Set as thumbnail"
                  >
                    <ImageIcon size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReplacePicker(image.id);
                    }}
                    disabled={isBusy}
                    className="rounded-lg bg-admin-surface p-2 text-admin-ink transition-colors hover:bg-admin-canvas disabled:opacity-40"
                    title="Replace image"
                  >
                    <RefreshCw size={16} />
                  </button>
                  {hasError && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetry(image.id);
                      }}
                      className="rounded-lg bg-admin-surface p-2 text-himalayan transition-colors hover:bg-admin-canvas"
                      title="Retry upload"
                    >
                      <RefreshCw size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(image.id);
                    }}
                    className="rounded-lg bg-admin-surface p-2 text-red-600 transition-colors hover:bg-red-50"
                    title="Remove image"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {isThumbnail && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-himalayan px-2 py-0.5 text-[11px] font-semibold text-white">
                    Thumbnail
                  </span>
                )}

                {image.status === 'local' && !isBusy && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Preview
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
