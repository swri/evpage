// Supabase branch of lib/cleanup against a fake client: RPC first (it clears
// references), then Storage removal in batches of 100.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const calls: string[] = [];
const removedBatches: string[][] = [];
let rpcData: unknown = [];

mock.module('../src/lib/supabase/client.ts', {
  namedExports: {
    isSupabaseConfigured: () => true,
    createClient: () => ({
      rpc: async (name: string) => {
        calls.push(`rpc:${name}`);
        return { data: rpcData, error: null };
      },
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            calls.push('storage.remove');
            removedBatches.push(paths);
            return { data: paths.map((name) => ({ name })), error: null };
          },
        }),
      },
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'delete', 'order']) b[m] = () => b;
        b.then = (resolve: (r: unknown) => unknown) => resolve({ data: [{ id: 'x' }], error: null });
        return b;
      },
    }),
  },
});

const { purgeEventPaymentProofs, removeOrphanProofs } = await import('../src/lib/cleanup.ts');
const session = { user: { id: 'u', email: 'u@test.com', full_name: 'U' }, token: 't' };

test('purge calls the RPC before deleting files, in batches of 100', async () => {
  calls.length = 0;
  removedBatches.length = 0;
  rpcData = Array.from({ length: 250 }, (_, i) => `evt/${i}.jpg`);
  const res = await purgeEventPaymentProofs({ id: 'evt', status: 'open' }, session);
  assert.equal(res.removed, 250);
  assert.equal(calls[0], 'rpc:purge_event_payment_proofs');
  assert.deepEqual(removedBatches.map((b) => b.length), [100, 100, 50]);
});

test('orphan cleanup removes exactly the listed orphan files', async () => {
  calls.length = 0;
  removedBatches.length = 0;
  rpcData = [{ name: 'evt/orphan.jpg', event_id: 'evt', size_bytes: '2000', created_at: '' }];
  const res = await removeOrphanProofs('evt');
  assert.equal(res.removed, 1);
  assert.deepEqual(calls, ['rpc:list_orphan_payment_proofs', 'storage.remove']);
  assert.deepEqual(removedBatches, [['evt/orphan.jpg']]);
});
