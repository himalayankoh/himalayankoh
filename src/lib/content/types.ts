/**
 * Shared shapes for editorial content attached to a product or a category shelf:
 * gallery photographs, accordion guides, and downloadable PDFs.
 *
 * These are the last survivors of the PDP content system that used to live in
 * `lib/products/pdpContent/`. That module existed to build livestock product
 * pages — benefits-for-horses copy, cattle paddock galleries, feeding guides — and
 * went with the niche. The *shapes* stayed, because the category hubs still carry
 * real pink salt content (photographs, shelf guides, downloadable sheets), and
 * because the hub and the product page should describe their media the same way.
 *
 * `visible: false` is how an editor withholds a piece without deleting it; every
 * consumer filters on it rather than trusting the list to be pre-filtered.
 */

/** A photograph, with the intrinsic size needed to reserve layout space (CLS). */
export interface ContentGalleryImage {
  id: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  visible?: boolean;
}

export interface ContentAccordionFaq {
  question: string;
  answer: string;
}

/** One collapsed section of long-form copy: paragraphs, bullets, or FAQs. */
export interface ContentAccordionArticle {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  faqs?: ContentAccordionFaq[];
  visible?: boolean;
}

export interface ContentPdfResource {
  id: string;
  title: string;
  description: string;
  /** Absolute URL or site-root path (e.g. /resources/guide.pdf). */
  url: string;
  fileSize: string;
  /** ISO date the file was published. */
  publishedAt: string;
  visible?: boolean;
}
