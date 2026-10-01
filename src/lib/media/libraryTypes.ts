/**
 * The shape of one image in the admin image library, shared by the API route that
 * reads it out of WordPress and the client that renders it — so the two cannot
 * drift into disagreeing about a field name.
 */

import type { ImageUsage } from './libraryUsage';

export interface LibraryImage {
  /** The WordPress attachment id. */
  id: number;
  /** The full-size file. */
  url: string;
  /** The smallest stored copy, for the grid. Falls back to `url`. */
  thumbnail: string;
  title: string;
  /** Alt text, as WordPress holds it. Empty means it has none. */
  alt: string;
  width: number | null;
  height: number | null;
  /** File size in bytes when WordPress reports it. */
  bytes: number | null;
  mimeType: string;
  /** ISO date the file was added. */
  date: string | null;
  /** Catalogue products that render this file. Empty means nothing uses it. */
  usedBy: ImageUsage[];
}

export interface LibraryPage {
  images: LibraryImage[];
  page: number;
  perPage: number;
  /** Total matches WordPress reports, when it reports one. */
  total: number | null;
  hasMore: boolean;
}
