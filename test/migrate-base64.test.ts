import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMimeFromBuffer,
  parseBase64DataUrl,
  isAlreadyMigratedAttachment,
  createAttachmentReference,
} from '../scripts/migrate-base64-attachments.mjs';

test('detectMimeFromBuffer correctly detects PNG magic bytes', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const res = detectMimeFromBuffer(pngHeader);
  assert.deepEqual(res, { mime: 'image/png', ext: 'png' });
});

test('detectMimeFromBuffer correctly detects JPG magic bytes', () => {
  const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const res = detectMimeFromBuffer(jpgHeader);
  assert.deepEqual(res, { mime: 'image/jpeg', ext: 'jpg' });
});

test('detectMimeFromBuffer correctly detects WEBP magic bytes', () => {
  const webpHeader = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ]);
  const res = detectMimeFromBuffer(webpHeader);
  assert.deepEqual(res, { mime: 'image/webp', ext: 'webp' });
});

test('detectMimeFromBuffer correctly detects PDF magic bytes', () => {
  const pdfHeader = Buffer.from('%PDF-1.7\n%...');
  const res = detectMimeFromBuffer(pdfHeader);
  assert.deepEqual(res, { mime: 'application/pdf', ext: 'pdf' });
});

test('detectMimeFromBuffer rejects non-whitelisted formats (e.g. SVG or plain text)', () => {
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(detectMimeFromBuffer(svgBuffer), null);

  const textBuffer = Buffer.from('Just some plain text content');
  assert.equal(detectMimeFromBuffer(textBuffer), null);
});

test('parseBase64DataUrl parses valid base64 PNG and rejects SVG', () => {
  const pngBase64 = 'data:image/png;base64,iVBORw0KGgo=';
  const parsed = parseBase64DataUrl(pngBase64);
  assert.ok(parsed);
  assert.equal(parsed.declaredMime, 'image/png');
  assert.equal(parsed.detected?.mime, 'image/png');
  assert.equal(parsed.isSvg, false);

  const svgBase64 = 'data:image/svg+xml;base64,' + Buffer.from('<svg><script/></svg>').toString('base64');
  const parsedSvg = parseBase64DataUrl(svgBase64);
  assert.ok(parsedSvg);
  assert.equal(parsedSvg.isSvg, true);
  assert.equal(parsedSvg.detected, null); // Magic bytes reject SVG
});

test('createAttachmentReference creates standard format matching form-attachments.ts', () => {
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const mimeInfo = { mime: 'image/png', ext: 'png' };
  const { reference, path } = createAttachmentReference(
    'evt-123',
    pngBuffer,
    mimeInfo,
    'https://xyz.supabase.co/storage/v1/object/public/form-attachments'
  );

  assert.ok(path.startsWith('evt-123/att-'));
  assert.ok(path.endsWith('.png'));
  assert.equal(reference.size, pngBuffer.length);
  assert.equal(reference.type, 'image/png');
  assert.equal(reference.path, path);
  assert.equal(
    reference.url,
    `https://xyz.supabase.co/storage/v1/object/public/form-attachments/${path}`
  );
});

test('isAlreadyMigratedAttachment recognizes already migrated objects', () => {
  const migratedObj = {
    name: 'file.png',
    size: 1024,
    type: 'image/png',
    path: 'evt/att-123.png',
    url: 'https://supabase.co/storage/v1/object/public/form-attachments/evt/att-123.png',
  };
  assert.equal(isAlreadyMigratedAttachment(migratedObj), true);

  // String data URLs are NOT already migrated
  assert.equal(isAlreadyMigratedAttachment('data:image/png;base64,...'), false);
  assert.equal(isAlreadyMigratedAttachment(null), false);
  assert.equal(isAlreadyMigratedAttachment({}), false);
});
