import { useEffect, useRef, useState } from 'react';
import { Check, FlipHorizontal, Loader2, RotateCcw, RotateCw, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { AdminProductImage } from './productImageTypes';
import { AdminButton, AdminModal } from './AdminUI';
import { BUTTON, MICRO_LABEL } from './adminTheme';

interface Props {
  image: AdminProductImage | null;
  onClose: () => void;
  onApply: (file: File) => Promise<void> | void;
}

type Adjustments = {
  zoom: number;
  rotation: number;
  flipX: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  cleanBackground: boolean;
};

const defaults: Adjustments = {
  zoom: 1,
  rotation: 0,
  flipX: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  cleanBackground: false,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The edited image could not be loaded.'));
  image.src = source;
});

export default function ProductImageEditor({ image, onClose, onApply }: Props) {
  const [adjustments, setAdjustments] = useState(defaults);
  const [applying, setApplying] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [error, setError] = useState('');
  const sourceRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (image) {
      setAdjustments(defaults);
      setError('');
      setAiProgress('');
    }
  }, [image]);

  if (!image) return null;

  const update = (key: keyof Adjustments, value: number | boolean) =>
    setAdjustments((current) => ({ ...current, [key]: value }));

  const apply = async () => {
    const source = sourceRef.current;
    if (!source?.naturalWidth || !source.naturalHeight) {
      setError('Image is still loading. Please try again in a moment.');
      return;
    }

    setApplying(true);
    setError('');
    try {
      let renderSource = source;
      let temporarySourceUrl = '';
      if (adjustments.cleanBackground) {
        setAiProgress('Loading the free AI model…');
        const sourceBlob = image.file
          ? image.file
          : await fetch(image.previewUrl).then((response) => {
              if (!response.ok) throw new Error('Could not download this image for AI background removal. Upload it again and retry.');
              return response.blob();
            });
        const { removeBackground } = await import('@imgly/background-removal');
        const foreground = await removeBackground(sourceBlob, {
          device: 'cpu',
          model: 'isnet_quint8',
          output: { format: 'image/png', quality: 1 },
          progress: (key: string, current: number, total: number) => setAiProgress(
            total ? `Downloading AI ${key}: ${Math.round((current / total) * 100)}%` : `Preparing AI ${key}…`
          ),
        });
        temporarySourceUrl = URL.createObjectURL(foreground);
        renderSource = await loadImage(temporarySourceUrl);
        setAiProgress('AI background removed — exporting on white…');
      }

      const canvas = document.createElement('canvas');
      canvas.width = renderSource.naturalWidth;
      canvas.height = renderSource.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare the image editor.');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((adjustments.rotation * Math.PI) / 180);
      context.scale(adjustments.flipX ? -adjustments.zoom : adjustments.zoom, adjustments.zoom);
      context.filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;
      context.drawImage(renderSource, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      context.restore();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
      if (!blob) throw new Error('Could not export the edited image.');
      const baseName = image.file?.name || image.previewUrl.split('/').pop()?.split('?')[0] || 'product-image';
      const file = new File([blob], `${baseName.replace(/\.[^.]+$/, '')}-edited.webp`, { type: 'image/webp' });
      await onApply(file);
      if (temporarySourceUrl) URL.revokeObjectURL(temporarySourceUrl);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply image edits.');
    } finally {
      setApplying(false);
    }
  };

  const filter = `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%)`;

  const miniButton =
    'flex flex-col items-center gap-1 rounded-xl border border-admin-line px-2 py-2 text-xs font-semibold text-admin-ink transition-colors hover:bg-admin-canvas';

  return (
    <AdminModal
      title="Crop, enhance and prepare your image"
      description="Edits are applied in the browser; the original file is replaced only when you apply."
      onClose={onClose}
      size="xl"
      bodyClassName="px-0 py-0"
    >
      {/* Fixed two columns — the console never reflows into a stacked layout. */}
      <div className="grid grid-cols-[1fr_340px]">
        <div className="flex min-h-[360px] items-center justify-center overflow-hidden bg-admin-canvas p-5">
          <div className="relative flex h-full max-h-[56vh] min-h-[280px] w-full items-center justify-center overflow-hidden rounded-xl border border-admin-line bg-admin-surface">
              <img
                ref={sourceRef}
                src={image.previewUrl}
                crossOrigin="anonymous"
                alt="Editing preview"
                className="max-h-full max-w-full object-contain transition-transform duration-150"
                style={{ filter, transform: `rotate(${adjustments.rotation}deg) scale(${adjustments.flipX ? -adjustments.zoom : adjustments.zoom}, ${adjustments.zoom})` }}
              />
            </div>
        </div>

        <aside className="overflow-y-auto border-l border-admin-line p-5">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={MICRO_LABEL}>Zoom / crop</span>
                <span className="text-xs font-semibold text-admin-ink">
                  {Math.round(adjustments.zoom * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update('zoom', clamp(adjustments.zoom - 0.1, 0.5, 3))}
                  className={`${BUTTON.secondary} px-2.5 py-2`}
                  aria-label="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <input
                  aria-label="Zoom"
                  className="flex-1 accent-himalayan"
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.05"
                  value={adjustments.zoom}
                  onChange={(event) => update('zoom', Number(event.target.value))}
                />
                <button
                  type="button"
                  onClick={() => update('zoom', clamp(adjustments.zoom + 0.1, 0.5, 3))}
                  className={`${BUTTON.secondary} px-2.5 py-2`}
                  aria-label="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => update('rotation', adjustments.rotation - 90)} className={miniButton}>
                <RotateCcw size={17} /> Rotate left
              </button>
              <button type="button" onClick={() => update('rotation', adjustments.rotation + 90)} className={miniButton}>
                <RotateCw size={17} /> Rotate right
              </button>
              <button type="button" onClick={() => update('flipX', !adjustments.flipX)} className={miniButton}>
                <FlipHorizontal size={17} /> Flip
              </button>
            </div>

            {([
              ['brightness', 'Brightness'],
              ['contrast', 'Contrast'],
              ['saturation', 'Colour'],
            ] as const).map(([key, label]) => (
              <label key={key} className="block">
                <span className="flex justify-between text-sm font-semibold text-admin-ink">
                  <span>{label}</span>
                  <span className="text-admin-muted">{adjustments[key]}%</span>
                </span>
                <input
                  className="mt-2 w-full accent-himalayan"
                  type="range"
                  min="50"
                  max="150"
                  value={adjustments[key]}
                  onChange={(event) => update(key, Number(event.target.value))}
                />
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-himalayan/25 bg-himalayan-lighter p-3 text-sm text-admin-ink">
              <input
                type="checkbox"
                checked={adjustments.cleanBackground}
                onChange={(event) => update('cleanBackground', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-admin-line-strong text-himalayan focus:ring-himalayan"
              />
              <span>
                <span className="flex items-center gap-1 font-semibold text-himalayan-dark">
                  <Sparkles size={15} /> Remove background with free AI
                </span>
                <span className="mt-1 block text-xs text-admin-muted">
                  Runs in the browser with no API key, then exports the product on a clean white
                  background. The first use downloads the model once (about 40 MB).
                </span>
                <a
                  href="https://github.com/imgly/background-removal-js"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-[11px] text-himalayan underline"
                >
                  Powered by IMG.LY background-removal (AGPL)
                </a>
              </span>
            </label>

            <AdminButton className="w-full" onClick={() => setAdjustments(defaults)}>
              Reset adjustments
            </AdminButton>
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}
            {aiProgress && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{aiProgress}</p>
            )}
            <button type="button" onClick={apply} disabled={applying} className={`${BUTTON.primary} w-full py-3`}>
              {applying ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
              {applying ? 'Applying edits…' : 'Apply & replace image'}
            </button>
          </div>
        </aside>
      </div>
    </AdminModal>
  );
}
