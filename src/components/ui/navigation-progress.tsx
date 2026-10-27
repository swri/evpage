'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const START_EVENT = 'evp:navigation-start';

function currentRouteKey() {
  return `${location.pathname}?${new URLSearchParams(location.search).toString()}`;
}

/** Call right before router.push() so programmatic navigations show the bar too. */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT));
}

// Next's <Link> always calls preventDefault, so this inspects the anchor itself
function isInternalNavigation(e: MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const anchor = (e.target as Element | null)?.closest?.('a');
  if (!anchor || !anchor.href || anchor.hasAttribute('download')) return false;
  if (anchor.target && anchor.target !== '_self') return false;

  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return false;
  // Same page (or only a #hash change) does not navigate
  return url.pathname !== location.pathname || url.search !== location.search;
}

/**
 * Thin bar at the top of the viewport while a route is loading. It finishes
 * when the URL the router renders changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  // Route the navigation started from; null when idle
  const [from, setFrom] = useState<string | null>(null);
  const state = from === null ? 'idle' : from === routeKey ? 'loading' : 'done';

  useEffect(() => {
    const start = () => setFrom(currentRouteKey());
    const onClick = (e: MouseEvent) => {
      if (isInternalNavigation(e)) start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START_EVENT, start);
    };
  }, []);

  useEffect(() => {
    if (state === 'idle') return;
    // 'done': let the bar fill and fade. 'loading': give up if nothing happens.
    const t = setTimeout(() => setFrom(null), state === 'done' ? 400 : 15000);
    return () => clearTimeout(t);
  }, [state]);

  if (state === 'idle') return null;
  return <div className="nav-progress" data-state={state} aria-hidden="true" />;
}
