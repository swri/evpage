'use client';

import React, { useEffect, useState, use } from 'react';
import { EventBuilder } from '@/components/admin/event-builder';
import { getEventById } from '@/lib/store';
import { EventItem } from '@/types';
import { useOrg } from '@/components/admin/org-context';

function EditEventContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { canManageEvent, loading: orgLoading } = useOrg();

  useEffect(() => {
    getEventById(id)
      .then((evt) => {
        setEvent(evt);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || orgLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-12 text-center text-neutral-500">
        Event yang dicari tidak ditemukan.
      </div>
    );
  }

  if (!canManageEvent(event)) {
    return (
      <div className="p-12 text-center text-neutral-500">
        Anda tidak memiliki akses untuk mengubah event ini.
      </div>
    );
  }

  return <EventBuilder initialEvent={event} isEdit={true} />;
}

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
        </div>
      }
    >
      <EditEventContent params={params} />
    </React.Suspense>
  );
}
