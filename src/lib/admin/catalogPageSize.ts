/**
 * How many products one console page shows.
 *
 * Its own module because both sides of the admin catalog seam need it: the
 * server read model as its default page size, and the products screen to work
 * out the "showing 11–20 of 47" footer. Importing it from the read model would
 * drag that model — and everything it reads — into the browser; duplicating the
 * number would let the pager and the server disagree about page boundaries.
 */
export const ADMIN_CATALOG_PER_PAGE = 10;
