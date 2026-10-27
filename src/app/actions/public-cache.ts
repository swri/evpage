'use server';

import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { EVENTS_TAG, drawTag, eventTag, isValidSlug } from '@/lib/server/cache-tags';

/**
 * Called by the admin after saving an event or changing a published draw, so
 * the public pages show the change on the next visit instead of after the
 * cache lifetime. Only signed-in Supabase users who belong to the organization
 * owning the event (or are super admins) may trigger it; in demo mode
 * public pages are not server-cached, so it is a no-op.
 */
export async function refreshPublicEvent(slugs: string[]): Promise<void> {
  const supabase = await createClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;

  const validSlugs = Array.from(new Set(slugs.map((s) => s.toLowerCase()).filter(isValidSlug)));
  if (validSlugs.length === 0) return;

  // Verify that the user is a member of the event's organization or is platform admin
  const { data: events } = await supabase
    .from('events')
    .select('slug, organization_id')
    .in('slug', validSlugs);

  if (!events || events.length === 0) return;

  // Check platform admin status
  const { data: platformAdmin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();

  let authorizedSlugs: string[] = [];

  if (platformAdmin) {
    authorizedSlugs = events.map((e) => e.slug.toLowerCase());
  } else {
    const orgIds = Array.from(new Set(events.map((e) => e.organization_id).filter(Boolean)));
    if (orgIds.length > 0) {
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .in('organization_id', orgIds);

      const allowedOrgIds = new Set((memberships || []).map((m) => m.organization_id));
      authorizedSlugs = events
        .filter((e) => e.organization_id && allowedOrgIds.has(e.organization_id))
        .map((e) => e.slug.toLowerCase());
    }
  }

  if (authorizedSlugs.length === 0) return;

  for (const slug of authorizedSlugs) {
    updateTag(eventTag(slug));
    updateTag(drawTag(slug));
  }
  updateTag(EVENTS_TAG);
}

