'use client';

import React from 'react';
import { EventBuilder } from '@/components/admin/event-builder';

export default function NewEventPage() {
  return <EventBuilder isEdit={false} />;
}
