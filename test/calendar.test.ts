import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeIcsText,
  buildIcsContent,
  formatIcsDate,
} from '../src/lib/calendar.ts';

test('escapeIcsText escapes semicolons, backslashes, commas and normalizes newlines', () => {
  const input = 'Line 1\\test;part,item\r\nLine 2\rLine 3\nLine 4';
  const escaped = escapeIcsText(input);

  // Solitary \r, \n, and \r\n should all become literal \n
  assert.ok(!escaped.includes('\r'));
  assert.ok(!escaped.includes('\n'));
  assert.equal(
    escaped,
    'Line 1\\\\test\\;part\\,item\\nLine 2\\nLine 3\\nLine 4'
  );
});

test('buildIcsContent prevents CRLF injection in summary, location, and description', () => {
  const content = buildIcsContent({
    id: 'evt-123\r\nX-INJECTED:bad',
    title: 'Match Day\r\nTRIGGER-ALARM:YES',
    location: 'Field A\rATTACK:1',
    description: 'Come and play\nORGANIZER:fake',
    starts_at: '2026-11-28T06:00:00.000Z',
    organizer_name: 'TI-PIHC',
  });

  // Verify CRLF lines count and structure
  const lines = content.split('\r\n');
  assert.ok(lines.includes('BEGIN:VCALENDAR'));
  assert.ok(lines.includes('END:VCALENDAR'));

  // UID must not have injected lines
  assert.ok(!lines.some((l) => l.startsWith('X-INJECTED')));
  const uidLine = lines.find((l) => l.startsWith('UID:'));
  assert.ok(uidLine);
  assert.equal(uidLine, 'UID:evt-123X-INJECTEDbad@evpage');

  // Summary and Location must have escaped newlines (\n) not raw CRLF
  assert.ok(!lines.some((l) => l.startsWith('TRIGGER-ALARM')));
  assert.ok(!lines.some((l) => l.startsWith('ATTACK')));
  assert.ok(lines.some((l) => l.startsWith('SUMMARY:Match Day\\nTRIGGER-ALARM:YES')));
  assert.ok(lines.some((l) => l.startsWith('LOCATION:Field A\\nATTACK:1')));
});

test('formatIcsDate formats Date into RFC 5545 UTC timestamp', () => {
  const d = new Date('2026-11-28T06:00:00.000Z');
  assert.equal(formatIcsDate(d), '20261128T060000Z');
});
