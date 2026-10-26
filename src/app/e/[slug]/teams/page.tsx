'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Shuffle, Users } from 'lucide-react';
import { getEventBySlug, formatIndoDate } from '@/lib/store';
import { getPublicDraw, type PublicDraw } from '@/lib/draws';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';

function TeamsContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [draw, setDraw] = useState<PublicDraw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getEventBySlug(slug)
      .then((event) => getPublicDraw(slug, event))
      .then(setDraw)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] dark:bg-[#09090b]">
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <AppLogo size="sm" subtitle="Pembagian Tim" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        <Link
          href={`/e/${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke halaman event
        </Link>

        {loading ? (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white mx-auto" />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !draw ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
            <Users className="mx-auto h-8 w-8 text-neutral-400" />
            <h1 className="mt-3 text-lg font-bold text-neutral-900 dark:text-neutral-100">Pembagian tim belum diumumkan</h1>
            <p className="mt-1 text-xs text-neutral-500">Panitia akan mempublikasikan hasil undian di halaman ini.</p>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
                {draw.event_title}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span>Versi {draw.version} · diperbarui {formatIndoDate(draw.updated_at, true)}</span>
                {draw.seed && (
                  <span className="inline-flex items-center gap-1">
                    <Shuffle className="h-3 w-3" /> Kode acak <span className="font-mono">{draw.seed}</span>
                  </span>
                )}
              </p>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {draw.teams.map((team) => (
                <section
                  key={team.id}
                  aria-labelledby={`team-${team.id}`}
                  className="rounded-xl border border-neutral-200 bg-white overflow-hidden dark:border-neutral-800 dark:bg-neutral-900"
                  style={{ borderTop: `4px solid ${team.color}` }}
                >
                  <h2 id={`team-${team.id}`} className="px-4 pt-3 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {team.name} <span className="font-normal text-neutral-500">({team.players.length})</span>
                  </h2>
                  <ol className="px-4 pb-3 pt-2 space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
                    {team.players.map((p, i) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>
                          {i + 1}. {p.name}
                          {p.backNumber !== undefined && p.backNumber !== '' && ` #${p.backNumber}`}
                        </span>
                        {p.position && <span className="text-neutral-400">{p.position}</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function TeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <React.Suspense fallback={null}>
      <TeamsContent params={params} />
    </React.Suspense>
  );
}
