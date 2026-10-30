import test from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, linkifyText, locationHref, formatDescriptionText } from '../src/lib/links.ts';

test('linkifyText turns http(s) URLs into links and keeps the rest as text', () => {
  const segs = linkifyText('Lokasi:\n\nhttps://maps.app.goo.gl/MQu7pAP48o5MG9B28');
  assert.deepEqual(segs, [
    { type: 'text', value: 'Lokasi:\n\n' },
    { type: 'link', value: 'https://maps.app.goo.gl/MQu7pAP48o5MG9B28', href: 'https://maps.app.goo.gl/MQu7pAP48o5MG9B28' },
  ]);
});

test('sentence punctuation after a URL is not part of the link', () => {
  const segs = linkifyText('Daftar di https://evpage.id/e/cup. Terima kasih!');
  assert.equal(segs[1].type === 'link' && segs[1].href, 'https://evpage.id/e/cup');
  assert.equal(segs[2].value, '. Terima kasih!');
  const paren = linkifyText('(lihat https://contoh.com/a)');
  assert.equal(paren[1].type === 'link' && paren[1].href, 'https://contoh.com/a');
});

test('non-http schemes are never linked', () => {
  for (const text of ['javascript:alert(1)', 'data:text/html;base64,xx', 'ftp://host/file']) {
    assert.ok(linkifyText(text).every((s) => s.type === 'text'), text);
  }
});

test('text without URLs stays a single text segment', () => {
  assert.deepEqual(linkifyText('Tanpa tautan'), [{ type: 'text', value: 'Tanpa tautan' }]);
  assert.deepEqual(linkifyText(''), []);
});

test('isHttpUrl accepts only absolute http(s) URLs', () => {
  assert.equal(isHttpUrl('https://maps.app.goo.gl/x'), true);
  assert.equal(isHttpUrl('  http://contoh.com '), true);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('maps.app.goo.gl/x'), false);
});

test('locationHref prefers the map link, falls back to a Google Maps search', () => {
  assert.equal(locationHref('GOR', 'https://maps.app.goo.gl/x'), 'https://maps.app.goo.gl/x');
  assert.equal(
    locationHref('Jl. SMA 63 No.6, Petukangan', 'javascript:alert(1)'),
    'https://www.google.com/maps/search/?api=1&query=Jl.%20SMA%2063%20No.6%2C%20Petukangan'
  );
  assert.equal(locationHref('', null), null);
});

test('formatDescriptionText parses bold text (**text** and *text*) and keeps links', () => {
  const input = '⚽ **MINI SOCCER TI DDS** ⚽\n\nHalo *semua*! 👋\nGabung di https://example.com/wa ya!';
  const segs = formatDescriptionText(input);
  assert.deepEqual(segs, [
    { type: 'text', value: '⚽ ' },
    { type: 'bold', value: 'MINI SOCCER TI DDS' },
    { type: 'text', value: ' ⚽\n\nHalo ' },
    { type: 'bold', value: 'semua' },
    { type: 'text', value: '! 👋\nGabung di ' },
    { type: 'link', value: 'https://example.com/wa', href: 'https://example.com/wa' },
    { type: 'text', value: ' ya!' },
  ]);
});

test('formatDescriptionText keeps non-matching asterisks as plain text', () => {
  const input = 'Hitungan: 2 * 3 = 6 dan bintang tunggal * saja';
  const segs = formatDescriptionText(input);
  assert.deepEqual(segs, [{ type: 'text', value: input }]);
});

test('formatDescriptionText handles empty string', () => {
  assert.deepEqual(formatDescriptionText(''), []);
});
