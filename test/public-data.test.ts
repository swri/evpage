import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPublicSupabase,
  fetchOpenEvents,
  fetchPublicDraw,
  fetchPublicEvent,
  isServerDataEnabled,
  previewDescription,
} from '../src/lib/server/public-data.ts';
import { drawTag, eventTag, isValidSlug } from '../src/lib/server/cache-tags.ts';

type Row = Record<string, unknown>;

/** Minimal PostgREST-like fake: tables + rpc results, records the calls */
function fakeClient(tables: Record<string, Row[]>, rpcs: Record<string, unknown>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      let rows = tables[table] || [];
      const q = {
        select: () => q,
        order: () => q,
        eq: (col: string, val: unknown) => {
          calls.push(`${table}.eq(${col}=${val})`);
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (r: unknown) => unknown) => resolve({ data: rows, error: null }),
      };
      return q;
    },
    rpc: async (name: string, args: unknown) => {
      calls.push(`rpc:${name}:${JSON.stringify(args)}`);
      return { data: rpcs[name] ?? null, error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const openEvent = { id: 'e1', slug: 'cup', title: 'Cup', status: 'open', organization_id: 'o1', form_schema: [] };
const org = { id: 'o1', name: 'Arena', accent_color: '#000', wa_number: '62812', payment_info: { bank_name: 'BCA' } };

test('server data needs real Supabase settings (placeholders = demo mode)', () => {
  assert.equal(isServerDataEnabled({}), false);
  assert.equal(
    isServerDataEnabled({ NEXT_PUBLIC_SUPABASE_URL: 'https://your-project-id.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x' }),
    false
  );
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' };
  assert.equal(isServerDataEnabled(env), true);
  assert.ok(createPublicSupabase(env));
  assert.equal(createPublicSupabase({}), null);
});

test('fetchPublicEvent loads the event, its slot counts and its organization branding', async () => {
  const { client, calls } = fakeClient(
    { events: [openEvent], organizations: [org] },
    { get_event_public_stats: [{ event_id: 'e1', slots_used: 7, active_registrations: 3 }] }
  );
  const page = await fetchPublicEvent(client, 'CUP');
  assert.equal(page?.event.slots_used, 7);
  assert.equal(page?.event.active_registrations, 3);
  assert.equal(page?.settings.name, 'Arena');
  assert.ok(calls.includes('events.eq(slug=cup)'), 'slug is matched lowercase and exactly');
});

test('fetchPublicEvent returns null for unknown slugs, without extra queries', async () => {
  const { client, calls } = fakeClient({ events: [] }, {});
  assert.equal(await fetchPublicEvent(client, 'nope'), null);
  assert.ok(!calls.some((c) => c.startsWith('rpc:')));
});

test('fetchOpenEvents asks only for open events and attaches counts', async () => {
  const { client, calls } = fakeClient(
    { events: [openEvent, { ...openEvent, id: 'e2', slug: 'draft', status: 'draft' }] },
    { get_event_public_stats: [{ event_id: 'e1', slots_used: 2, active_registrations: 2 }] }
  );
  const events = await fetchOpenEvents(client);
  assert.deepEqual(events.map((e) => e.id), ['e1']);
  assert.equal(events[0].slots_used, 2);
  assert.ok(calls.includes('events.eq(status=open)'));
});

test('fetchPublicDraw goes through the get_public_draw RPC', async () => {
  const draw = { event_title: 'Cup', version: 2, updated_at: '', teams: [] };
  const { client, calls } = fakeClient({}, { get_public_draw: draw });
  assert.deepEqual(await fetchPublicDraw(client, 'Cup'), draw);
  assert.ok(calls.some((c) => c === 'rpc:get_public_draw:{"p_event_slug":"cup"}'));
});

test('previewDescription strips markdown and stays short', () => {
  const d = previewDescription({ description: '## Selamat **datang** di turnamen!\n\n' + 'x'.repeat(300) });
  assert.ok(!d.includes('#') && !d.includes('*'));
  assert.ok(d.length <= 180);
  assert.equal(previewDescription({ description: '', location: 'GOR Senayan' }), 'GOR Senayan');
});

test('cache tags and slug validation', () => {
  assert.equal(eventTag('Cup'), 'public-event:cup');
  assert.equal(drawTag('cup'), 'public-draw:cup');
  assert.equal(isValidSlug('mini-cup-2026'), true);
  assert.equal(isValidSlug('../etc'), false);
  assert.equal(isValidSlug(''), false);
});
