import { Suspense } from 'react';
import { HomeClient } from './home-client';
import { getCachedOpenEvents } from '@/lib/server/public-cache';
import { isServerDataEnabled } from '@/lib/server/public-data';

// Public pages must show their UI immediately on navigation (validated in dev)
export const instant = true;

const PLATFORM_SETTINGS = {
  name: 'EvPage',
  accent_color: '#171717',
  wa_number: '',
  payment_info: { bank_name: '', account_number: '', account_holder: '' },
};

// Browser-loaded version: demo mode, and the fallback while/if the server read fails
const clientLoaded = <HomeClient preloaded={false} initialEvents={[]} initialSettings={null} />;

/**
 * Open events are cached on the server (part of the static shell, refreshed
 * every minute or when an organizer saves). If the database cannot be reached,
 * for example during a build before migrations ran, the page loads in the
 * browser instead of failing.
 */
async function ServerEvents() {
  const result = await getCachedOpenEvents();
  if (!result.ok) return clientLoaded;
  return <HomeClient preloaded initialEvents={result.data} initialSettings={PLATFORM_SETTINGS} />;
}

export default function HomePage() {
  if (!isServerDataEnabled()) return clientLoaded;
  return (
    <Suspense fallback={clientLoaded}>
      <ServerEvents />
    </Suspense>
  );
}
