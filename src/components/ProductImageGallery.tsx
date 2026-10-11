import { useEffect, useRef, useState } from 'react';
import { galleryImages } from '../lib/images/galleryImages';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const imageKey = JSON.stringify({ images, srcsets });
  useEffect(() => {
    setCurrentIndex(0);
    setFailedImages([]);
    let active = true;
    const source = JSON.parse(imageKey) as { images: string[]; srcsets?: ResponsiveImageSources };
    // Check small, store-published candidates first. This validates hidden slides
    // without downloading every full-resolution original on mobile.
    const probes = galleryImages(source.images).map(url => {
      const probe = new Image();
      probe.fetchPriority = 'low';
      probe.decoding = 'async';
      const candidate = responsiveImageProps(url, source.srcsets, '64px');
      probe.onerror = () => {
        if (!active) return;
        if (dropResponsiveCandidates(probe)) { probe.src = url; return; }
        setFailedImages(failed => [...failed, url]);
      };
      if (candidate.srcSet) { probe.srcset = candidate.srcSet; probe.sizes = candidate.sizes ?? '64px'; }
      probe.src = candidate.src;
      return probe;
    });
    return () => { active = false; probes.forEach(probe => { probe.onerror = null; }); };
  }, [imageKey]);

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
    <div className={`relative w-full aspect-[4/3] sm:aspect-square bg-warm-white overflow-hidden ${rounded}`}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={e => { if (e.pointerType === 'touch') gesture.current = { x: e.clientX, y: e.clientY }; }}
      onPointerCancel={() => { gesture.current = null; }}
      onPointerUp={e => {
        const start = gesture.current; gesture.current = null;
        if (!start) return;
        const dx = e.clientX - start.x; const dy = e.clientY - start.y;
        if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.3) { if (dx < 0) goToNext(); else goToPrevious(); }
      }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={currentImage}
          src={heroImage.src}
          srcSet={heroImage.srcSet}
          sizes={heroImage.sizes}
          alt={`${alt} - Image ${visibleIndex + 1}`}
          // Only the first image is the LCP candidate; the rest wait until the
          // shopper asks for them rather than competing with it for bandwidth.
          fetchPriority={currentIndex === 0 ? 'high' : 'auto'}
          loading={currentIndex === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="w-full h-full object-contain p-2 sm:p-4"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onError={(e) => {
            const image = e.currentTarget;
            // Same self-healing rule as the card: a candidate that 404s falls
            // back to the original, and only the original failing is a broken
            // image.
            if (dropResponsiveCandidates(image)) {
              image.src = heroImage.src;
              return;
            }
            setFailedImages(failed => [...failed, currentImage]);
          }}
        />
      </AnimatePresence>

      {/* Navigation arrows - only show if multiple images */}
      {validImages.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/80 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all"
            aria-label="Previous image"
          >
            <ChevronLeft size={20} className="text-charcoal" />
          </button>

          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/80 hover:bg-white backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all"
            aria-label="Next image"
          >
            <ChevronRight size={20} className="text-charcoal" />
          </button>

          {/* Thumbnail indicators */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex max-w-[calc(100%-1rem)] overflow-x-auto">
            {validImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                aria-pressed={idx === visibleIndex}
                className={`shrink-0 w-11 h-11 border-[17px] border-transparent bg-clip-content rounded-full transition-colors ${
                  idx === visibleIndex
                    ? 'bg-himalayan-dark'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to image ${idx + 1}`}
              />
            ))}
          </div>

          {/* Image counter */}
          <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-xs font-semibold rounded-full">
            {visibleIndex + 1} / {validImages.length}
          </div>
        </>
      )}
    </div>
  );
}
