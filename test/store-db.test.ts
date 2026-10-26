// Exercises the Supabase branches of the store against a fake client, so the
// "database is the source of truth" contract is verified without a real DB.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

type Result = { data: unknown; error: { message: string } | null };

const calls: { table?: string; rpc?: string; args?: unknown }[] = [];
let nextResult: Result = { data: [], error: null };
let rpcResult: Result = { data: null, error: null };

function queryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'eq', 'limit', 'insert', 'update', 'upsert', 'delete']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, args: [method, ...args] });
      return builder;
    };
  }
  builder.maybeSingle = async () => nextResult;
  builder.single = async () => nextResult;
  builder.then = (resolve: (r: Result) => unknown) => resolve(nextResult);
  return builder;
}

const fakeClient = {
  from: (table: string) => queryBuilder(table),
  rpc: async (name: string, args: unknown) => {
    calls.push({ rpc: name, args });
    return rpcResult;
  },
};

mock.module('../src/lib/supabase/client.ts', {
  namedExports: {
    createClient: () => fakeClient,
    isSupabaseConfigured: () => true,
  },
});

const store = await import('../src/lib/store.ts');

test('getAllEvents returns an empty DB result instead of demo events', async () => {
  nextResult = { data: [], error: null };
  const events = await store.getAllEvents();
  assert.deepEqual(events, []);
});

test('getAllEvents surfaces DB errors instead of silently using demo data', async () => {
  nextResult = { data: null, error: { message: 'permission denied' } };
  await assert.rejects(store.getAllEvents(), /permission denied/);
});

test('getEventBySlug matches exactly (no ilike wildcards)', async () => {
  calls.length = 0;
  nextResult = { data: null, error: null };
  assert.equal(await store.getEventBySlug('Mini%'), null);
  const eqCall = calls.find((c) => Array.isArray(c.args) && c.args[0] === 'eq');
  assert.deepEqual(eqCall?.args, ['eq', 'slug', 'mini%']);
});

test('createRegistration uses the atomic RPC with a server-side amount', async () => {
  const event = {
    id: 'evt-1',
    status: 'open',
    price_type: 'fixed',
    price_amount: 75000,
    form_schema: [],
    registration_deadline: new Date(Date.now() + 86400000).toISOString(),
  };
  nextResult = { data: event, error: null };
  rpcResult = { data: { id: 'reg-1', code: 'EVT-2026-0001', total_amount: 75000 }, error: null };
  calls.length = 0;

  const reg = await store.createRegistration({
    event_id: 'evt-1',
    answers: {},
    contact_name: 'Budi',
    contact_phone: '0812',
    contact_email: '-',
  });

  const rpcCall = calls.find((c) => c.rpc === 'create_registration_atomic');
  assert.ok(rpcCall, 'expected create_registration_atomic to be called');
  assert.equal((rpcCall.args as Record<string, unknown>).p_total_amount, 75000);
  assert.equal(reg.code, 'EVT-2026-0001');
});

test('createRegistration reports RPC failures (e.g. quota full) to the caller', async () => {
  nextResult = {
    data: { id: 'evt-1', status: 'open', price_type: 'free', price_amount: 0, form_schema: [] },
    error: null,
  };
  rpcResult = { data: null, error: { message: 'Kuota pendaftaran telah penuh' } };
  await assert.rejects(
    store.createRegistration({
      event_id: 'evt-1',
      answers: {},
      contact_name: 'Budi',
      contact_phone: '0812',
      contact_email: '-',
    }),
    /Kuota pendaftaran telah penuh/
  );
});

test('updateRegistrationStatus throws when the update is rejected', async () => {
  nextResult = { data: null, error: { message: 'new row violates row-level security' } };
  await assert.rejects(store.updateRegistrationStatus('reg-1', 'verified'), /row-level security/);
});

test('getOrganizationSettings never falls back to demo bank details', async () => {
  nextResult = { data: null, error: { message: 'boom' } };
  const settings = await store.getOrganizationSettings();
  assert.equal(settings.payment_info.account_number, '');
});
