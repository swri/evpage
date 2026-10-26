// Cache tags for public, server-rendered pages. Shared by the cached readers
// (lib/server/public-cache.ts) and the server action that invalidates them.
export const EVENTS_TAG = 'public-events';
export const eventTag = (slug: string) => `public-event:${slug.toLowerCase()}`;
export const drawTag = (slug: string) => `public-draw:${slug.toLowerCase()}`;

/** Slugs are [a-z0-9-] (see slugify); anything else is not a real event. */
export const isValidSlug = (slug: string) => /^[a-z0-9-]{1,120}$/.test(slug);
