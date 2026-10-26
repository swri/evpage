import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvCell, sanitizeCsvRow } from '../src/lib/export.ts';

test('sanitizeCsvCell neutralises formula-looking strings', () => {
  assert.equal(sanitizeCsvCell('=HYPERLINK("http://x","klik")'), `'=HYPERLINK("http://x","klik")`);
  assert.equal(sanitizeCsvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(sanitizeCsvCell('+6281234'), "'+6281234");
  assert.equal(sanitizeCsvCell('\t=1+1'), "'\t=1+1");
});

test('sanitizeCsvCell leaves normal values untouched', () => {
  assert.equal(sanitizeCsvCell('Budi Santoso'), 'Budi Santoso');
  assert.equal(sanitizeCsvCell('-'), '-');
  assert.equal(sanitizeCsvCell(750000), 750000);
  assert.equal(sanitizeCsvCell(null), null);
});

test('sanitizeCsvRow applies to every column', () => {
  assert.deepEqual(sanitizeCsvRow({ Nama: '=cmd', Total: 5 }), { Nama: "'=cmd", Total: 5 });
});
