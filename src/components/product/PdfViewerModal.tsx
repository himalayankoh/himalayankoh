import { useEffect, useRef } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import type { ContentPdfResource } from '../../lib/content/types';

interface Props {
  resource: ContentPdfResource | null;
  onClose: () => void;
}

function resolvePdfUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${window.location.origin}${path}`;
}

export default function PdfViewerModal({ resource, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (resource) {
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => closeRef.current?.focus());
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    if (dialog.open) dialog.close();
  }, [resource]);

  const pdfUrl = resource ? resolvePdfUrl(resource.url) : '';
  const viewerSrc = resource ? `${pdfUrl}#toolbar=1&navpanes=0` : '';

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-overlay m-0 max-h-none max-w-none w-full h-full bg-transparent p-0 backdrop:bg-black/60 open:flex open:items-center open:justify-center"
      aria-labelledby={resource ? 'pdf-viewer-title' : undefined}
      aria-hidden={!resource}
    >
      {resource && (
        <div className="flex flex-col w-[min(960px,94vw)] h-[min(85vh,720px)] bg-white rounded-2xl shadow-2xl overflow-hidden mx-4">
          <header className="flex items-start justify-between gap-4 px-4 md:px-5 py-4 border-b border-gray-100 shrink-0">
            <div className="min-w-0">
              <h2 id="pdf-viewer-title" className="font-serif text-lg font-bold text-charcoal truncate">
                {resource.title}
              </h2>
              <p className="text-xs text-charcoal-light mt-0.5 line-clamp-2">{resource.description}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-himalayan/40"
              aria-label="Close PDF viewer"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 min-h-0 bg-gray-100">
            <iframe
              title={`PDF: ${resource.title}`}
              src={viewerSrc}
              className="w-full h-full border-0"
            />
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 px-4 md:px-5 py-3 border-t border-gray-100 shrink-0">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-charcoal border border-gray-200 rounded-xl hover:border-himalayan/40 hover:text-himalayan transition-colors"
            >
              <ExternalLink size={16} />
              Open in New Tab
            </a>
            <a
              href={pdfUrl}
              download
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-himalayan hover:bg-himalayan-dark rounded-xl transition-colors"
            >
              <Download size={16} />
              Download
            </a>
          </footer>
        </div>
      )}
    </dialog>
  );
}
