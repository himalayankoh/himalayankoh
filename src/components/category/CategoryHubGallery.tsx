import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import type { ContentGalleryImage } from '../../lib/content/types';

interface Props {
  images: ContentGalleryImage[];
  title: string;
}

/** Compact clickable thumbnails; full-size view in lightbox. */
export default function CategoryHubGallery({ images, title }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const showPrev = useCallback(() => {
    setLightboxIndex((prev) =>
      prev === null ? null : (prev - 1 + images.length) % images.length
    );
  }, [images.length]);
  const showNext = useCallback(() => {
    setLightboxIndex((prev) =>
      prev === null ? null : (prev + 1) % images.length
    );
  }, [images.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowLeft') showPrev();
      if (event.key === 'ArrowRight') showNext();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lightboxIndex, closeLightbox, showPrev, showNext]);

  if (images.length === 0) return null;

  const active = lightboxIndex !== null ? images[lightboxIndex] : null;

  return (
    <div aria-label={`${title} lifestyle gallery`}>
      <p className="text-[11px] text-charcoal-light/80 mb-2">Tap to enlarge</p>

      <ul
        className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] sm:grid sm:grid-cols-4 sm:overflow-visible"
        role="list"
      >
        {images.map((image, index) => (
          <li key={image.id} role="listitem" className="snap-start shrink-0 w-[96px] sm:w-auto">
            <button
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="group relative w-full aspect-[4/3] min-h-[80px] sm:min-h-[88px] rounded-lg overflow-hidden bg-warm-white border border-gray-200/80 hover:border-himalayan/40 focus:outline-none focus:ring-2 focus:ring-himalayan/40 transition-colors flex items-center justify-center p-1.5"
              aria-label={`View larger: ${image.alt}`}
            >
              <img
                src={image.src}
                alt={image.alt}
                width={image.width ?? 200}
                height={image.height ?? 150}
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-full w-auto h-auto object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = '/images/placeholder-product.svg'; }}
              />
              <span className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/20 transition-colors" aria-hidden />
              <span className="absolute bottom-1 right-1 w-6 h-6 rounded-md bg-white/90 text-charcoal flex items-center justify-center opacity-80 group-hover:opacity-100 shadow-sm">
                <Expand size={12} aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {active && lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal bg-black/95 flex items-center justify-center p-4"
            onClick={closeLightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Gallery image preview"
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Close preview"
            >
              <X size={24} />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrev();
                  }}
                  className="absolute left-2 sm:left-6 w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showNext();
                  }}
                  className="absolute right-2 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
                  aria-label="Next image"
                >
                  <ChevronRight size={24} />
                </button>
              </>
            )}

            <motion.img
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              src={active.src}
              alt={active.alt}
              className="max-w-full max-h-[78vh] rounded-xl shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-center max-w-lg px-4 pointer-events-none">
              <p className="text-sm font-medium line-clamp-2">{active.alt}</p>
              {images.length > 1 && (
                <p className="text-white/60 text-xs mt-1">
                  {lightboxIndex + 1} / {images.length}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
