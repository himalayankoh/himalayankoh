import type {
  ContentAccordionArticle,
  ContentGalleryImage,
  ContentPdfResource,
} from '../content/types';

export interface CategoryTrustPoint {
  label: string;
  detail: string;
}

export interface CategoryArticleCard {
  id: string;
  title: string;
  excerpt: string;
  image: string;
  readTime: string;
  tag: string;
  /** Longer copy for show more / show less on category hub. */
  body?: string;
  /** Blog slug path, e.g. /blog/my-post */
  href?: string;
}

export interface CategoryHero {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export interface CategorySeo {
  title: string;
  description: string;
}

export interface CategoryContentBundle {
  /** Internal registry key */
  key: string;
  /** Matches `Product.category` / filter tab label */
  productCategoryLabel: string;
  hero: CategoryHero;
  seo: CategorySeo;
  trustPoints: CategoryTrustPoint[];
  gallery: ContentGalleryImage[];
  guides: ContentAccordionArticle[];
  articles: CategoryArticleCard[];
  pdfs: ContentPdfResource[];
  emptyStates: {
    gallery?: string;
    guides?: string;
    articles?: string;
    pdfs?: string;
  };
}

export interface CategoryContentAvailability {
  gallery: boolean;
  guides: boolean;
  articles: boolean;
  pdfs: boolean;
}
