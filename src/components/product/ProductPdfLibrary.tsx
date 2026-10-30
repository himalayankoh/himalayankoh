import { useState } from 'react';
import { FileText, Eye } from 'lucide-react';
import type { ContentPdfResource } from '../../lib/content/types';
import { formatPublishedMonthYear } from '../../lib/content/publishedDate';
import PdfViewerModal from './PdfViewerModal';

interface Props {
  resources: ContentPdfResource[];
  /** Dev/admin preview: show hidden resources with a badge. */
  showHidden?: boolean;
  /** Category hub: no duplicate heading / outer card chrome. */
  embedded?: boolean;
}

export default function ProductPdfLibrary({
  resources,
  showHidden = false,
  embedded = false,
}: Props) {
  const [activeResource, setActiveResource] = useState<ContentPdfResource | null>(null);

  const visibleResources = showHidden
    ? resources
    : resources.filter((r) => r.visible !== false);

  if (visibleResources.length === 0) {
    return null;
  }

  const list = (
        <ul
          className={`grid gap-3 ${embedded ? 'grid-cols-1' : 'sm:grid-cols-2'}`}
          role="list"
        >
          {visibleResources.map((resource) => {
            const isHidden = resource.visible === false;
            return (
              <li key={resource.id} role="listitem">
                <article className="h-full flex flex-col p-4 border border-gray-100 rounded-xl hover:border-himalayan/30 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-charcoal text-sm leading-snug">{resource.title}</h3>
                    {isHidden && showHidden && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-charcoal-light leading-relaxed mb-3 flex-1">
                    {resource.description}
                  </p>
                  <p className="text-[11px] text-charcoal-light/80 mb-3">
                    {resource.fileSize} · {formatPublishedMonthYear(resource.publishedAt)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveResource(resource)}
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-himalayan bg-himalayan/10 hover:bg-himalayan/15 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-himalayan/40"
                  >
                    <Eye size={16} />
                    View PDF
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
  );

  return (
    <>
      {embedded ? (
        <div aria-label="PDF resources">{list}</div>
      ) : (
        <section
          className="mt-8 bg-white rounded-2xl shadow-md shadow-black/5 p-6 md:p-8"
          aria-label="PDF resources"
        >
          <div className="flex items-center gap-2 mb-5">
            <FileText size={20} className="text-himalayan" />
            <h2 className="font-serif text-xl font-bold text-charcoal">Resources</h2>
          </div>
          {list}
        </section>
      )}

      <PdfViewerModal resource={activeResource} onClose={() => setActiveResource(null)} />
    </>
  );
}
