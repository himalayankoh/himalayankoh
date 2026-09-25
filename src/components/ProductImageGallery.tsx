import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
  variant?: 'page' | 'modal';
  rounded?: string;
}

export default function ProductImageGallery({
  images,
  alt,
  rounded = 'rounded-3xl',
}: ProductImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter out empty or whitespace-only strings
  const validImages = (images || []).filter(
    (img): img is string => typeof img === 'string' && img.trim().length > 0
  );

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
    setCurrentIndex((prev) => (prev === 0 ? validImages.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === validImages.length - 1 ? 0 : prev + 1));
  };

  const currentImage = validImages[currentIndex] || validImages[0];

  return (
    <div className={`relative w-full aspect-[4/3] sm:aspect-square bg-white overflow-hidden ${rounded}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.img
          key={currentIndex}
          src={currentImage}
          alt={`${alt} - Image ${currentIndex + 1}`}
          fetchPriority={currentIndex === 0 ? 'high' : 'auto'}
          decoding="async"
          className="w-full h-full object-contain"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/images/placeholder-product.svg';
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
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {validImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                aria-pressed={idx === currentIndex}
                className={`w-8 h-8 border-[10px] border-transparent bg-clip-content rounded-full transition-colors ${
                  idx === currentIndex
                    ? 'bg-himalayan-dark'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to image ${idx + 1}`}
              />
            ))}
          </div>

          {/* Image counter */}
          <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-xs font-semibold rounded-full">
            {currentIndex + 1} / {validImages.length}
          </div>
        </>
      )}
    </div>
  );
}
