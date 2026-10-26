import test from 'node:test';
import assert from 'node:assert/strict';
import { loginRedirectPath, needsAuthCheck, safeNextPath, supabaseEnv } from '../src/lib/admin-guard.ts';

const configured = supabaseEnv({
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key',
});

test('supabaseEnv treats empty or placeholder values as demo mode', () => {
  assert.equal(supabaseEnv({}), null);
  assert.equal(
    supabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://your-project-id.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }),
    null
  );
  assert.ok(configured);
});

test('only protected admin paths are checked, and only in Supabase mode', () => {
  assert.equal(needsAuthCheck('/admin/events', null), false, 'demo mode');
  assert.equal(needsAuthCheck('/admin/events', configured), true);
  assert.equal(needsAuthCheck('/admin', configured), true);
  assert.equal(needsAuthCheck('/admin/login', configured), false);
  assert.equal(needsAuthCheck('/admin/register', configured), false);
  assert.equal(needsAuthCheck('/e/cup', configured), false);
});

test('login redirect keeps the destination, and ?next cannot leave the admin area', () => {
  assert.equal(loginRedirectPath('/admin/events/1/edit'), '/admin/login?next=%2Fadmin%2Fevents%2F1%2Fedit');
  assert.equal(safeNextPath('/admin/events'), '/admin/events');
  assert.equal(safeNextPath('https://evil.com'), '/admin');
  assert.equal(safeNextPath('//evil.com'), '/admin');
  assert.equal(safeNextPath(null), '/admin');
});
