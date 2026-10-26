import test from 'node:test';
import assert from 'node:assert/strict';
import { saveEvent, slugify, validateEventInput } from '../src/lib/store.ts';

test('slugify normalises free text into a URL slug', () => {
  assert.equal(slugify('  Mini Soccer Cup 2026!  '), 'mini-soccer-cup-2026');
  assert.equal(slugify('%%%'), '');
});

test('validateEventInput rejects negative or malformed numbers and dates', () => {
  assert.equal(validateEventInput({ quota: 10, price_amount: 0 }), null);
  assert.match(validateEventInput({ quota: -1 }) || '', /Kuota/);
  assert.match(validateEventInput({ quota: 2.5 }) || '', /Kuota/);
  assert.match(validateEventInput({ price_amount: -5000 }) || '', /Harga/);
  assert.match(validateEventInput({ starts_at: 'besok' }) || '', /mulai/);
  assert.match(
    validateEventInput({
      starts_at: '2026-11-10T08:00:00Z',
      registration_deadline: '2026-11-12T08:00:00Z',
    }) || '',
    /Batas pendaftaran/
  );
});

test('saveEvent normalises slugs on update and blocks collisions', async () => {
  const a = await saveEvent({ title: 'Slug A ' + Date.now(), form_schema: [] });
  const b = await saveEvent({ title: 'Slug B ' + Date.now(), form_schema: [] });

  const renamed = await saveEvent({ id: a.id, slug: 'Turnamen Baru ' + a.id.slice(0, 4) });
  assert.match(renamed.slug, /^turnamen-baru-[a-z0-9-]+$/);

  await assert.rejects(saveEvent({ id: b.id, slug: renamed.slug }), /sudah dipakai/);
});
