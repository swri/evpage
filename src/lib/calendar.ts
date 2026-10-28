// Client-side iCalendar (.ics) generator.
// Creates event file locally in browser memory without calling any 3rd-party services.

export interface CalendarEventPayload {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  starts_at?: string;
  organizer_name?: string;
}

/** Formats a Date object to iCalendar UTC timestamp format (YYYYMMDDTHHmmssZ) */
export function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escapes special characters according to RFC 5545 specifications and prevents CRLF injection */
export function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Builds standard RFC 5545 VCALENDAR text content.
 */
export function buildIcsContent(event: CalendarEventPayload): string {
  const startDate = event.starts_at ? new Date(event.starts_at) : new Date();
  const validStart = isNaN(startDate.getTime()) ? new Date() : startDate;
  // Default duration: 2 hours
  const endDate = new Date(validStart.getTime() + 2 * 60 * 60 * 1000);

  const safeUid = (event.id || 'evt-' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EvPage//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${safeUid}@evpage`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(validStart)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${escapeIcsText(event.title || 'Event')}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    event.organizer_name ? `ORGANIZER;CN=${escapeIcsText(event.organizer_name)}:mailto:noreply@evpage.com` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  return lines;
}

/**
 * Generates and triggers download of an .ics file in browser.
 */
export function downloadEventIcs(event: CalendarEventPayload): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const icsContent = buildIcsContent(event);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanTitle = (event.title || 'jadwal-event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
    link.download = `${cleanTitle || 'event'}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
