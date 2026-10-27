// Cached server readers for public pages. Entries are tagged per event so a
// save in the admin can refresh them immediately (app/actions/public-cache.ts);
// otherwise they revalidate every minute ('minutes' profile), which keeps slot
// counts reasonably fresh. The registration RPC re-checks the quota anyway.
//
// These functions never throw: an error inside 'use cache' fails the
// prerender (and the build) even when the caller catches it. A failed read is
// cached only for 'seconds', which also keeps it out of the static shell, and
// the page falls back to loading in the browser.
import { cacheLife, cacheTag } from 'next/cache';
import { EVENTS_TAG, drawTag, eventTag } from './cache-tags';
import { createPublicSupabase, fetchOpenEvents, fetchPublicDraw, fetchPublicEvent } from './public-data';
import { logger } from '../logger';

export type CachedResult<T> = { ok: true; data: T } | { ok: false };

async function attempt<T>(label: string, read: () => Promise<T>): Promise<CachedResult<T>> {
  try {
    const data = await read();
    cacheLife('minutes');
    return { ok: true, data };
  } catch (err) {
    logger.error('public-cache', `Server prefetch (${label}) failed, the page will load it in the browser:`, err);
    cacheLife('seconds');
    return { ok: false };
  }
}

export async function getCachedPublicEvent(slug: string) {
  'use cache';
  cacheTag(eventTag(slug), EVENTS_TAG);
  return attempt(`event ${slug}`, async () => {
    const client = createPublicSupabase();
    return client ? fetchPublicEvent(client, slug) : null;
  });
}

export async function getCachedOpenEvents() {
  'use cache';
  cacheTag(EVENTS_TAG);
  return attempt('open events', async () => {
    const client = createPublicSupabase();
    return client ? fetchOpenEvents(client) : [];
  });
}

export async function getCachedPublicDraw(slug: string) {
  'use cache';
  cacheTag(drawTag(slug));
  return attempt(`teams ${slug}`, async () => {
    const client = createPublicSupabase();
    return client ? fetchPublicDraw(client, slug) : null;
  });
}
