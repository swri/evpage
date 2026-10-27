import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EventRegistrationClient } from './registration-client';
import { RegistrationFormSkeleton } from '@/components/ui/skeleton';
import { getCachedPublicEvent } from '@/lib/server/public-cache';
import { isServerDataEnabled, previewDescription } from '@/lib/server/public-data';
import { isValidSlug } from '@/lib/server/cache-tags';

type Params = { params: Promise<{ slug: string }> };

// Public pages must show their UI immediately on navigation (validated in dev)
export const instant = true;

/**
 * Link previews (WhatsApp, Facebook, X) read these tags. Next.js serves them
 * in <head> for those crawlers even though metadata streams for browsers.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  if (!isServerDataEnabled() || !isValidSlug(slug)) return { title: 'Pendaftaran Event' };

  const result = await getCachedPublicEvent(slug);
  const data = result.ok ? result.data : null;
  if (!data) return { title: 'Pendaftaran Event', robots: { index: false } };

  const { event, settings } = data;
  const title = `${event.title} · ${settings.name}`;
  const description = previewDescription(event) || `Daftar ${event.title}`;
  return {
    title,
    description,
    openGraph: {
      title: event.title,
      description,
      type: 'website',
      siteName: settings.name,
      images: event.cover_url ? [{ url: event.cover_url }] : undefined,
    },
    twitter: { card: event.cover_url ? 'summary_large_image' : 'summary', title: event.title, description },
  };
}

// params are read inside the Suspense boundary so the App Shell can prerender
async function EventContent({ params }: Params) {
  const { slug } = await params;
  let serverData = isServerDataEnabled() && isValidSlug(slug);
  let data = null;
  if (serverData) {
    const result = await getCachedPublicEvent(slug);
    // Database hiccup: let the browser load it instead of showing an error page
    if (result.ok) data = result.data;
    else serverData = false;
  }

  return (
    <EventRegistrationClient
      slug={slug}
      preloaded={serverData}
      initialEvent={data?.event ?? null}
      initialSettings={data?.settings ?? null}
    />
  );
}

export default function EventRegistrationPage({ params }: Params) {
  return (
    <Suspense fallback={<RegistrationFormSkeleton />}>
      <EventContent params={params} />
    </Suspense>
  );
}
