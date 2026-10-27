import { cn } from '@/lib/utils';

/** Grey placeholder block that pulses while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-md bg-neutral-200/70 animate-pulse dark:bg-neutral-800', className)} />;
}

/**
 * Stand-in for an admin page while its data loads: title, subtitle and a few
 * cards, roughly where the real page puts them, so content doesn't jump in.
 */
export function AdminPageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div role="status" aria-label="Memuat halaman" className="space-y-6">
      <div className="space-y-2 border-b border-neutral-200 pb-5 dark:border-neutral-800">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for the public registration page: header, cover, title and form fields. */
export function RegistrationFormSkeleton() {
  return (
    <div role="status" aria-label="Memuat formulir pendaftaran" className="min-h-screen bg-[#fafaf9] dark:bg-[#09090b]">
      <div className="h-14 border-b border-neutral-200/80 bg-white/80 dark:border-neutral-800 dark:bg-neutral-900/80" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-48 w-full rounded-xl sm:h-64" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="space-y-5 rounded-xl border border-neutral-200/90 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
