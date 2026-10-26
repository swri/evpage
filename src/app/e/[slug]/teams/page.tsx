import { Suspense } from 'react';
import type { Metadata } from 'next';
import { TeamsClient } from './teams-client';
import { getCachedPublicDraw } from '@/lib/server/public-cache';
import { isServerDataEnabled } from '@/lib/server/public-data';
import { isValidSlug } from '@/lib/server/cache-tags';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  if (!isServerDataEnabled() || !isValidSlug(slug)) return { title: 'Pembagian Tim' };
  const result = await getCachedPublicDraw(slug);
  const draw = result.ok ? result.data : null;
  if (!draw) return { title: 'Pembagian tim belum diumumkan', robots: { index: false } };
  const description = `${draw.teams.length} tim · versi ${draw.version}${draw.seed ? ` · kode acak ${draw.seed}` : ''}`;
  return {
    title: `Pembagian Tim · ${draw.event_title}`,
    description,
    openGraph: { title: `Pembagian Tim · ${draw.event_title}`, description, type: 'website' },
  };
}

async function TeamsContent({ params }: Params) {
  const { slug } = await params;
  let serverData = isServerDataEnabled() && isValidSlug(slug);
  let draw = null;
  if (serverData) {
    const result = await getCachedPublicDraw(slug);
    if (result.ok) draw = result.data;
    else serverData = false;
  }
  return <TeamsClient slug={slug} preloaded={serverData} initialDraw={draw} />;
}

export default function TeamsPage({ params }: Params) {
  return (
    <Suspense fallback={null}>
      <TeamsContent params={params} />
    </Suspense>
  );
}
