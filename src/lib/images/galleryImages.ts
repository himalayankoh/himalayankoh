/** Failed originals and duplicate URLs are not gallery slides. */
export function galleryImages(images: string[], failed: readonly string[] = []): string[] {
  return Array.from(new Set((images ?? []).filter(url => typeof url === 'string')
    .map(url => url.trim()).filter(url => url && !failed.includes(url))));
}

/** Horizontal browsing must not consume ordinary vertical page scrolling. */
export function gallerySwipeDirection(start: { x: number; y: number }, end: { x: number; y: number }): -1 | 0 | 1 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.3 ? (dx < 0 ? 1 : -1) : 0;
}
