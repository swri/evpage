'use client';

import React, { useEffect, useState, use } from 'react';
import { EventBuilder } from '@/components/admin/event-builder';
import { getEventById } from '@/lib/store';
import { EventItem } from '@/types';
import { useOrg } from '@/components/admin/org-context';
import { AdminPageSkeleton } from '@/components/ui/skeleton';

function EditEventContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const { id } = resolvedParams;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const { can, loading: orgLoading } = useOrg();

  useEffect(() => {
    getEventById(id)
      .then((evt) => {
        setEvent(evt);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading || orgLoading) {
    return <AdminPageSkeleton />;
  }

  if (!event) {
    return (
      <div className="p-12 text-center text-neutral-500">
        Event yang dicari tidak ditemukan.
      </div>
    );
  }

  // Cashier / check-in roles can view registrations but not edit the event
  if (!can('events.manage', event)) {
    return (
      <div className="p-12 text-center text-neutral-500">
        Anda tidak memiliki akses untuk mengubah event ini.
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2">
      <EventBuilder initialEvent={event} isEdit={true} />
    </div>
  );
}

export default function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={<AdminPageSkeleton />}
    >
      <EditEventContent params={params} />
    </React.Suspense>
  );
}
