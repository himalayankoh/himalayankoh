export interface WpMedia {
  id?: number;
  source_url?: string;
  title?: { rendered?: string };
  mime_type?: string;
}

export function mediaDownloadFilename(media: WpMedia): string {
  const urlName = String(media.source_url || '').split('/').pop()?.split('?')[0] || '';
  const title = String(media.title?.rendered || '').trim();
  const titleLooksLikeFile = /\.[a-z0-9]{2,5}$/i.test(title);
  const base = titleLooksLikeFile ? title : urlName || title || `image-${media.id ?? 'download'}`;

  const cleaned = base
    .replace(/[\\/]+/g, '-')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 140);

  return cleaned || `image-${media.id ?? 'download'}`;
}
