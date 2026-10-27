'use client';

import * as React from 'react';

/**
 * Keeps an element mounted for `exitMs` after `open` turns false, so it can
 * play an exit animation (`closing` is true during that time).
 */
export function usePresence(open: boolean, exitMs = 150) {
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);

  React.useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted: open || mounted, closing: !open };
}
