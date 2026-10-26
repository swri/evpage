'use server';

import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { EVENTS_TAG, drawTag, eventTag, isValidSlug } from '@/lib/server/cache-tags';

/**
 * Called by the admin after saving an event or changing a published draw, so
 * the public pages show the change on the next visit instead of after the
 * cache lifetime. Only signed-in Supabase users may trigger it; in demo mode
 * public pages are not server-cached, so it is a no-op.
 */
export async function refreshPublicEvent(slugs: string[]): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  for (const slug of new Set(slugs.map((s) => s.toLowerCase()).filter(isValidSlug))) {
    updateTag(eventTag(slug));
    updateTag(drawTag(slug));
  }
  updateTag(EVENTS_TAG);
}
