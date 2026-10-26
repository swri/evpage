import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageEvent, hashPassword, loginAdmin, type AdminSession } from '../src/lib/auth.ts';

const session = (id: string, email: string): AdminSession => ({
  user: { id, email, full_name: 'Test' },
  token: 't',
});

test('canManageEvent allows the owner and the super admin only', () => {
  const owner = session('u-1', 'owner@test.com');
  const other = session('u-2', 'other@test.com');
  const superAdmin = session('admin-demo-uuid-1', 'admin@evpage.com');

  assert.equal(canManageEvent({ created_by: 'u-1' }, owner), true);
  assert.equal(canManageEvent({ created_by: 'u-1' }, other), false);
  assert.equal(canManageEvent({ created_by: 'u-1' }, superAdmin), true);
  assert.equal(canManageEvent({}, other), false);
  assert.equal(canManageEvent({ created_by: 'u-1' }, null), false);
});

test('demo login accepts only the exact demo credentials', async () => {
  const ok = await loginAdmin('admin@evpage.com', 'admin123');
  assert.equal(ok.success, true);

  // Previously any email containing "admin" with admin123 was let in
  const spoof = await loginAdmin('notreally-admin@attacker.test', 'admin123');
  assert.equal(spoof.success, false);

  const wrong = await loginAdmin('admin@evpage.com', 'password123');
  assert.equal(wrong.success, false);
});

test('hashPassword is deterministic and does not contain the password', async () => {
  const a = await hashPassword('sari@test.com', 'rahasia123');
  const b = await hashPassword('sari@test.com', 'rahasia123');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.ok(!a.includes('rahasia123'));
  assert.notEqual(a, await hashPassword('lain@test.com', 'rahasia123'));
});
