/** Failed originals and duplicate URLs are not gallery slides. */
export function galleryImages(images: string[], failed: readonly string[] = []): string[] {
  return Array.from(new Set((images ?? []).filter(url => typeof url === 'string')
    .map(url => url.trim()).filter(url => url && !failed.includes(url))));
}
