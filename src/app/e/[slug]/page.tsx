import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EventRegistrationClient } from './registration-client';
import { getCachedPublicEvent } from '@/lib/server/public-cache';
import { isServerDataEnabled, previewDescription } from '@/lib/server/public-data';
import { isValidSlug } from '@/lib/server/cache-tags';

type Params = { params: Promise<{ slug: string }> };

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

function PageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b]">
      <div className="space-y-4 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white mx-auto" />
        <p className="text-sm text-neutral-500">Memuat formulir pendaftaran...</p>
      </div>
    </div>
  );
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
    <Suspense fallback={<PageSpinner />}>
      <EventContent params={params} />
    </Suspense>
  );
}
