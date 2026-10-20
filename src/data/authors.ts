export interface Author {
  id: string;
  slug: string;
  name: string;
  role: string;
  expertise: string[];
  bio: string;
  avatar: string;
  credentials?: string;
  socials?: {
    linkedin?: string;
    email?: string;
  };
}

/**
 * Public bylines, and only what is true about them.
 *
 * Every entry here is an organisation-level attribution of the company that
 * actually produces the content — the sourcing, warehouse, and copy teams at
 * Himalayan Koh. None of them is a person, and none of them claims a credential
 * the business does not hold.
 *
 * This list previously described a "Technical & Agricultural Advisory Board",
 * "Livestock Mineral Nutrition Specialists", and a "Codex Alimentarius & ASTM"
 * expertise, and pointed at `/images/authors/*.jpg` photographs that do not exist
 * on this site. A fabricated advisory panel with invented credentials is exactly
 * the pattern an ad reviewer reads as manufactured authority, and a broken avatar
 * is a visible symptom of the same thing: the profile described somebody who was
 * never there. Qualified reviewers have not been engaged, so no entry claims one.
 *
 * If a real, named person with real credentials is engaged later, add them here —
 * one entry, both render paths read it (the worker pre-render and the React page),
 * so a profile can never half-exist. Until then the honest byline is the company.
 */
export const AUTHORS: Record<string, Author> = {
  'sourcing-team': {
    id: 'author-1',
    slug: 'sourcing-team',
    name: 'Himalayan Koh Sourcing & Warehouse Team',
    role: 'Product and supply inquiries',
    expertise: [
      'Product identity and intended use',
      'Order coordination and supply inquiries',
      'Requests for available specifications',
    ],
    bio: 'The Himalayan Koh team that handles product and supply inquiries, order coordination and requests for available specifications. This company profile is not a supplier-audit certification or a laboratory report. Questions and document requests go to sales@himalayankoh.com.',
    avatar: '',
    socials: {
      email: 'sales@himalayankoh.com',
    },
  },
  'editorial-board': {
    id: 'author-2',
    slug: 'editorial-board',
    name: 'Himalayan Koh Editorial Team',
    role: 'Buying guides and product copy',
    expertise: [
      'Writing and updating buying guides',
      'Product listing accuracy',
      'Sourcing published references and handling corrections',
    ],
    bio: 'The Himalayan Koh team that writes and updates the store’s guides and product descriptions, working from the individual product listings and, where a claim needs a source, from published university extension, government and food-science material. This is the company’s own team: it is not an independent reviewer, it is not a veterinary or nutrition panel, and it does not claim to have tested the products. How we research, cite and correct guides is set out in our editorial policy.',
    avatar: '',
    socials: {
      email: 'sales@himalayankoh.com',
    },
  },
  // The slug is kept from the earlier profile so the two indexed URLs
  // (`/author/sourcing-team`, `/author/editorial-board`) and this one keep
  // resolving; only the description changed, because the description was the
  // part that was untrue.
  'agricultural-advisory': {
    id: 'author-3',
    slug: 'agricultural-advisory',
    name: 'Himalayan Koh Livestock Product Support',
    role: 'Order and product support for the livestock range',
    expertise: [
      'Sizing and weight of the salt lick and livestock bag range',
      'Order, shipping and returns questions',
      'Where to find the product label and lot information',
    ],
    bio: 'The Himalayan Koh team that answers questions about the salt lick and livestock bag range — weights, packing, shipping and returns. It supplies product and order information only; it does not give veterinary or animal nutrition advice, and it will point you to an appropriately qualified professional for anything about an animal’s health.',
    avatar: '',
    socials: {
      email: 'sales@himalayankoh.com',
    },
  },
};

export function getAuthorBySlug(slug: string): Author | undefined {
  return AUTHORS[slug.toLowerCase()];
}

export function getAllAuthors(): Author[] {
  return Object.values(AUTHORS);
}
