'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Calendar } from 'lucide-react';

interface EventBannerImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
}

function isWhitelistedRemote(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === 'images.unsplash.com' ||
      host.endsWith('.supabase.co') ||
      host === 'supabase.co' ||
      host === 'localhost'
    );
  } catch {
    return false;
  }
}

export function EventBannerImage({ src, alt, className = '', priority = false }: EventBannerImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400 dark:from-neutral-800 dark:to-neutral-900 dark:text-neutral-500 ${className}`}
        aria-label={alt}
      >
        <Calendar className="h-8 w-8 sm:h-10 sm:w-10 opacity-40" />
      </div>
    );
  }

  const isDataUrl = src.startsWith('data:');
  const isWhitelisted = isWhitelistedRemote(src);
  const unoptimized = isDataUrl || !isWhitelisted;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      priority={priority}
      unoptimized={unoptimized}
      onError={() => setHasError(true)}
      className={`object-cover ${className}`}
    />
  );
}
