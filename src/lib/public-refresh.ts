// Client-side trigger for refreshing server-cached public pages after an
// organizer changes something. Fire-and-forget: a failed refresh only means
// the change shows up after the cache lifetime (about a minute).
import { refreshPublicEvent } from '@/app/actions/public-cache';
import { isSupabaseConfigured } from './supabase/client';

export function refreshPublicPages(...slugs: (string | undefined | null)[]): void {
  // Demo mode renders public pages in the browser; nothing is cached on the server
  if (!isSupabaseConfigured()) return;
  refreshPublicEvent(slugs.filter((s): s is string => !!s)).catch((err) =>
    console.warn('Refreshing public pages failed; they will update within a minute:', err)
  );
}
