import { useEffect, useRef, useState } from 'react';
import { Sparkle, X, UploadSimple, Images } from '@phosphor-icons/react';
import { getFreshAccessToken } from '@/services/wordpressAdminAuth';
import { prepareImageForUpload } from '@/lib/image-upload';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import ImageLibraryPicker from './ImageLibraryPicker';

type ReferenceKind = 'reference' | 'label';
export default function ProductImageStudio({ image, productName, canAdd, onClose, onApply }: {
  image: { url: string; altText: string }; productName: string; canAdd: boolean;
  onClose: () => void; onApply: (image: string, mode: 'replace' | 'add') => Promise<void>;
}) {
  const dialog = useDialogFocus(true, onClose);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<Partial<Record<ReferenceKind, string>>>({});
  const [libraryKind, setLibraryKind] = useState<ReferenceKind | null>(null);
  const [result, setResult] = useState('');
  const [usePreview, setUsePreview] = useState(false);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const uploadKind = useRef<ReferenceKind>('reference');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getFreshAccessToken().then(token => fetch('/api/admin/product-image-studio', { headers: token ? { Authorization: `Bearer ${token}` } : {} }))
      .then(async response => {
        const data = await response.json() as { available?: boolean; detail?: string; error?: string };
        if (!response.ok) throw new Error(data.error || 'Image Studio status could not be read.');
        if (active) { setConfigured(data.available === true); if (!data.available) setError(data.detail || 'Image Studio is unavailable.'); }
      }).catch(e => { if (active) { setConfigured(false); setError(e instanceof Error ? e.message : 'Image Studio is unavailable.'); } });
    return () => { active = false; controller.current?.abort(); };
  }, []);

  async function generate() {
    if (locked.current || !configured || !prompt.trim()) return;
    locked.current = true; setBusy(true); setError('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const token = await getFreshAccessToken();
      const extras = (['reference', 'label'] as const).filter(kind => !!references[kind]);
      const instructions = `Product: ${productName}. ${extras.map((kind, i) => `Image ${i + 2} is the ${kind === 'label' ? 'exact replacement label artwork; preserve its text and logo' : 'additional scene/object reference'}.`).join(' ')}\n${prompt.trim()}`;
      const response = await fetch('/api/admin/product-image-studio', {
        method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt: instructions, sources: [usePreview && result ? result : image.url, ...extras.map(kind => references[kind])] }),
      });
      const data = await response.json() as { image?: string; error?: string };
      if (!response.ok || !data.image) throw new Error(data.error || 'No edited image was returned.');
      setResult(data.image); setCompare(false); setUsePreview(true);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Image generation failed.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function apply(mode: 'replace' | 'add') {
    if (locked.current || !result) return;
    locked.current = true; setUploading(true); setError('');
    try { await onApply(result, mode); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The image could not be added.'); }
    finally { locked.current = false; setUploading(false); }
  }
  async function attach(file?: File) {
    if (!file) return;
    const kind = uploadKind.current;
    try {
      const prepared = await prepareImageForUpload(file);
      setReferences(current => ({ ...current, [kind]: prepared.dataUrl })); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'The reference could not be read.'); }
    if (fileInput.current) fileInput.current.value = '';
  }
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-3 sm:p-6">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="image-studio-title" tabIndex={-1} className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-admin-line bg-admin-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-admin-line px-4 py-3">
          <div><h2 id="image-studio-title" className="flex items-center gap-2 text-base font-semibold text-admin-ink"><Sparkle size={18} className="text-himalayan" />AI Image Studio</h2><p className="text-xs text-admin-muted">{productName} · Nano Banana 2 via OpenRouter</p></div>
          <button type="button" onClick={onClose} disabled={uploading} aria-label="Close image studio" className="rounded-lg p-2 text-admin-muted hover:bg-himalayan-light"><X size={18} /></button>
        </header>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3 bg-himalayan-lighter p-4">
            <div className="flex h-[28dvh] min-h-40 items-center justify-center overflow-hidden rounded-xl border border-admin-line bg-white md:h-[48dvh]">
              <img src={!compare && result ? result : image.url} alt={!compare && result ? 'Generated edit preview, not saved' : image.altText || 'Original product image'} className="h-full w-full object-contain" />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-admin-muted"><span>{result && !compare ? 'Generated preview' : 'Original image'} · not saved to product</span>{result && <button type="button" onClick={() => setCompare(!compare)} className="font-semibold text-himalayan-dark underline">{compare ? 'View edit' : 'Compare original'}</button>}</div>
          </div>
          <aside className="space-y-4 p-4 md:border-l md:border-admin-line">
            <label htmlFor="studio-prompt" className="block text-sm font-semibold text-admin-ink">Describe the edit</label>
            <textarea id="studio-prompt" value={prompt} maxLength={2600} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="Place this product beside a horse in a natural setting. Keep the packaging unchanged. Or attach a label and ask to replace it." className="w-full rounded-lg border border-admin-line bg-white px-3 py-2 text-sm" />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void attach(e.target.files?.[0])} />
            <div className="grid grid-cols-2 gap-2">
              {(['reference', 'label'] as const).map(kind => <div key={kind} className="rounded-lg border border-admin-line p-2">
                <p className="mb-2 text-xs font-semibold text-admin-ink">{kind === 'label' ? 'Replacement label' : 'Extra reference'}</p>
                {references[kind] && <div className="relative mb-2"><img src={references[kind]} alt={`${kind} attachment`} className="h-14 w-full rounded object-contain" /><button type="button" aria-label={`Remove ${kind} attachment`} onClick={() => setReferences(current => ({ ...current, [kind]: undefined }))} className="absolute right-0 top-0 rounded bg-white p-1 text-admin-ink"><X size={12} /></button></div>}
                <button type="button" disabled={busy} onClick={() => { uploadKind.current = kind; fileInput.current?.click(); }} className="mb-1 flex items-center gap-1 text-xs text-himalayan-dark"><UploadSimple size={14} />Computer</button>
                <button type="button" disabled={busy} onClick={() => setLibraryKind(kind)} className="flex items-center gap-1 text-xs text-himalayan-dark"><Images size={14} />Library</button>
              </div>)}
            </div>
            {result && <label className="flex items-center gap-2 text-xs text-admin-ink"><input type="checkbox" checked={usePreview} onChange={e => setUsePreview(e.target.checked)} />Refine the generated preview</label>}
            {configured === null && <p role="status" className="text-xs text-admin-muted">Checking AI connection…</p>}
            {configured === false && <p className="text-xs text-admin-muted">Configure OpenRouter image-model access and credits in Admin Settings to enable this studio.</p>}
            <button type="button" disabled={!configured || !prompt.trim() || busy || uploading} onClick={() => void generate()} className="w-full rounded-lg bg-himalayan px-4 py-2.5 text-sm font-semibold text-white hover:bg-himalayan-dark disabled:opacity-50">{busy ? 'Generating edit…' : result ? 'Generate another edit' : 'Generate preview'}</button>
            <p className="text-[11px] leading-relaxed text-admin-muted">Uses your OpenRouter credits. Review product accuracy and label text before applying. Your original stays unchanged until you apply and save.</p>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            {(busy || uploading) && <p role="status" className="text-xs text-admin-muted">{uploading ? 'Adding image to your draft…' : 'AI is editing the image. You can close this preview; no product change is made.'}</p>}
          </aside>
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-admin-line px-4 py-3">
          <button type="button" onClick={onClose} disabled={uploading} className="rounded-lg border border-admin-line px-3 py-2 text-sm text-admin-ink">Cancel</button>
          <button type="button" disabled={!result || !canAdd || busy || uploading} onClick={() => void apply('add')} className="rounded-lg border border-admin-line px-3 py-2 text-sm text-admin-ink disabled:opacity-50">Add to gallery draft</button>
          <button type="button" disabled={!result || busy || uploading} onClick={() => void apply('replace')} className="rounded-lg bg-himalayan px-3 py-2 text-sm font-semibold text-white hover:bg-himalayan-dark disabled:opacity-50">Replace in draft</button>
        </footer>
      </div>
      <ImageLibraryPicker open={!!libraryKind} onClose={() => setLibraryKind(null)} attachedUrls={[]} room={1} title={libraryKind === 'label' ? 'Choose replacement label' : 'Choose reference image'} onAdd={urls => { if (libraryKind && urls[0]) setReferences(current => ({ ...current, [libraryKind]: urls[0] })); }} />
    </div>
  );
}
