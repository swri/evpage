import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let signInResult: { data: { user: unknown; session: unknown }; error: unknown } = {
  data: { user: null, session: null },
  error: { message: 'Invalid login credentials' },
};

mock.module('../src/lib/supabase/client.ts', {
  namedExports: {
    isSupabaseConfigured: () => true,
    createClient: () => ({
      auth: {
        signInWithPassword: async () => signInResult,
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  },
});

const { loginAdmin } = await import('../src/lib/auth.ts');

test('database mode never falls back to demo credentials', async () => {
  const res = await loginAdmin('admin@evpage.com', 'admin123');
  assert.equal(res.success, false);
});

test('database mode rejects authenticated users missing from admins table', async () => {
  signInResult = { data: { user: { id: 'u1', email: 'x@test.com' }, session: {} }, error: null };
  const res = await loginAdmin('x@test.com', 'whatever');
  assert.equal(res.success, false);
  assert.match(res.error || '', /penyelenggara/);
});
