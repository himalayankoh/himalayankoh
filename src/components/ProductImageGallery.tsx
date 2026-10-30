import { useEffect, useRef, useState } from 'react';
import { galleryImages, gallerySwipeDirection } from '../lib/images/galleryImages';
import { ChevronLeft, ChevronRight, ZoomIn, X } from 'lucide-react';
import {
  GALLERY_IMAGE_SIZES,
  dropResponsiveCandidates,
  responsiveImageProps,
  type ResponsiveImageSources,
} from '../lib/images/responsiveImage';

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
  variant?: 'page' | 'modal';
  rounded?: string;
  /** The store's own responsive candidates, keyed by image URL. */
  srcsets?: ResponsiveImageSources;
}

export default function ProductImageGallery({
  images,
  alt,
  rounded = 'rounded-3xl',
  srcsets,
}: ProductImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [isZoomed, setIsZoomed] = useState(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setFailedImages([]);
  }, [images]);

  // Filter out empty or whitespace-only strings
  const validImages = galleryImages(images, failedImages);
  const visibleIndex = Math.min(currentIndex, Math.max(0, validImages.length - 1));

  if (validImages.length === 0) {
    return (
      <div className={`w-full aspect-square bg-gray-100 ${rounded} flex items-center justify-center`}>
        <img
          src="/images/placeholder-product.svg"
          alt={alt}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  const goToPrevious = () => {
    setCurrentIndex(visibleIndex === 0 ? validImages.length - 1 : visibleIndex - 1);
  };

  const goToNext = () => {
    setCurrentIndex(visibleIndex === validImages.length - 1 ? 0 : visibleIndex + 1);
  };

  const currentImage = validImages[visibleIndex];
  const heroImage = responsiveImageProps(currentImage, srcsets, GALLERY_IMAGE_SIZES);

  return (
    <div className="flex flex-col w-full gap-2">
      <div
        className={`relative w-full aspect-[4/3] sm:aspect-square bg-warm-white overflow-hidden ${rounded}`}
        role="group"
        aria-label="Product images"
        tabIndex={0}
        style={{ touchAction: 'pan-y' }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || validImages.length < 2) return;
          if (e.key === 'ArrowRight') { e.preventDefault(); goToNext(); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevious(); }
        }}
        onPointerDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
            gesture.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => { gesture.current = null; }}
        onPointerUp={(e) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start) return;
          const direction = gallerySwipeDirection(start, { x: e.clientX, y: e.clientY });
          if (direction === 1) goToNext();
          if (direction === -1) goToPrevious();
        }}
      >
        <img
          key={currentImage}
          src={heroImage.src}
          srcSet={heroImage.srcSet}
          sizes={heroImage.sizes}
          alt={`${alt} - Image ${visibleIndex + 1}`}
          fetchPriority={currentIndex === 0 ? 'high' : 'auto'}
          loading={currentIndex === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="w-full h-full object-contain p-2 sm:p-4 cursor-zoom-in"
          onClick={() => setIsZoomed(true)}
          onError={(e) => {
            const image = e.currentTarget;
            if (dropResponsiveCandidates(image)) {
              image.src = heroImage.src;
              return;
            }
            setFailedImages((failed) => [...failed, currentImage]);
          }}
        />

        {/* Zoom button */}
        <button
          type="button"
          onClick={() => setIsZoomed(true)}
          className="absolute top-3 left-3 w-10 h-10 bg-white/80 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center shadow-md transition-all text-charcoal z-10"
          aria-label="Zoom image"
        >
          <ZoomIn size={18} />
        </button>

        {/* Navigation arrows - only show if multiple images */}
        {validImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={goToPrevious}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/85 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all z-10"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} className="text-charcoal" />
            </button>

            <button
              type="button"
              onClick={goToNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/85 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all z-10"
              aria-label="Next image"
            >
              <ChevronRight size={20} className="text-charcoal" />
            </button>

            {/* Image counter badge */}
            <div className="absolute top-3 right-3 px-3 py-1 bg-black/60 text-white text-xs font-semibold rounded-full z-10">
              {visibleIndex + 1} / {validImages.length}
            </div>
          </>
        )}
      </div>

      {/* Real image thumbnail switcher row below hero */}
      {validImages.length > 1 && (
        <div
          className="flex items-center gap-2 overflow-x-auto py-1 px-1 scrollbar-none"
          role="tablist"
          aria-label="Product thumbnails"
        >
          {validImages.map((img, idx) => (
            <button
              key={`${img}-${idx}`}
              type="button"
              role="tab"
              aria-selected={idx === visibleIndex}
              aria-label={`View photo ${idx + 1}`}
              onClick={() => setCurrentIndex(idx)}
              className={`relative shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-white ${
                idx === visibleIndex
                  ? 'border-himalayan ring-2 ring-himalayan/30 scale-105'
                  : 'border-gray-200 hover:border-himalayan/50 opacity-70 hover:opacity-100'
              }`}
            >
              <img
                src={img}
                alt={`${alt} thumbnail ${idx + 1}`}
                className="w-full h-full object-contain p-1"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-[95] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded product photo"
          onClick={() => setIsZoomed(false)}
        >
          <button
            type="button"
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 w-11 h-11 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors z-20"
            aria-label="Close enlarged view"
          >
            <X size={24} />
          </button>

          {validImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors z-20"
                aria-label="Previous photo"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); goToNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center transition-colors z-20"
                aria-label="Next photo"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <div
            className="relative max-w-5xl max-h-[85vh] w-full flex items-center justify-center p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage}
              alt={`${alt} enlarged view`}
              className="max-h-[80vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
            />
          </div>

          <div className="absolute bottom-6 px-4 py-1.5 bg-black/70 text-white text-xs font-semibold rounded-full">
            {visibleIndex + 1} / {validImages.length}
          </div>
        </div>
      )}
    </div>
  );
}
