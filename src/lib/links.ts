// Turning organizer-written text into safe, clickable links.
// Only http(s) URLs are ever linked, so "javascript:" or "data:" in a
// description stays plain text.

export type TextSegment = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

export type FormattedTextSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'link'; value: string; href: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
// Punctuation that usually ends a sentence rather than the URL
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Splits text into plain parts and http(s) links (trailing punctuation stays text). */
export function linkifyText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailing = url.match(TRAILING)?.[0] ?? '';
    // Keep a closing ")" that belongs to the URL, e.g. Wikipedia links
    if (trailing.startsWith(')') && url.includes('(')) url = url.slice(0, url.length - trailing.length + 1);
    else if (trailing) url = url.slice(0, url.length - trailing.length);

    if (start > last) segments.push({ type: 'text', value: text.slice(last, start) });
    segments.push({ type: 'link', value: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) });
  return segments;
}

// Regex for bold text: Markdown standard **bold** or WhatsApp standard *bold*.
// Group 2: content inside **...**
// Group 3: content inside *...*
const BOLD_PATTERN = /(\*\*([^\s*](?:[^*\n]*?[^\s*])?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*)/g;

/**
 * Splits organizer description into plain text, bold segments (**text** or *text*),
 * and clickable http(s) links. Arithmetic or non-paired asterisks remain plain text.
 */
export function formatDescriptionText(text: string): FormattedTextSegment[] {
  if (!text) return [];
  const linkSegments = linkifyText(text);
  const result: FormattedTextSegment[] = [];

  for (const seg of linkSegments) {
    if (seg.type === 'link') {
      result.push(seg);
      continue;
    }

    let last = 0;
    for (const match of seg.value.matchAll(BOLD_PATTERN)) {
      const start = match.index ?? 0;
      const full = match[0];
      const boldContent = match[2] || match[3];

      if (start > last) {
        result.push({ type: 'text', value: seg.value.slice(last, start) });
      }
      if (boldContent) {
        result.push({ type: 'bold', value: boldContent });
      }
      last = start + full.length;
    }
    if (last < seg.value.length) {
      result.push({ type: 'text', value: seg.value.slice(last) });
    }
  }

  return result;
}

/** True for absolute http(s) URLs (what the builder accepts as a location link). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Where the location should open: the organizer's map link if valid,
 * otherwise a Google Maps search for the address.
 */
export function locationHref(location: string | undefined, locationUrl?: string | null): string | null {
  if (locationUrl && isHttpUrl(locationUrl)) return locationUrl.trim();
  if (location?.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
  return null;
}
