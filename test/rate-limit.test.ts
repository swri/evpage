import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitStore,
  RATE_LIMIT_RULES,
} from '../src/lib/rate-limit.ts';

beforeEach(() => {
  resetRateLimitStore();
});

test('getClientIp parses headers correctly with fallback', () => {
  const h1 = new Headers({ 'x-forwarded-for': '203.0.113.195, 70.41.3.18' });
  assert.equal(getClientIp(h1), '203.0.113.195');

  const h2 = new Headers({ 'x-real-ip': '198.51.100.1' });
  assert.equal(getClientIp(h2), '198.51.100.1');

  const h3 = new Headers({ 'cf-connecting-ip': '192.0.2.1' });
  assert.equal(getClientIp(h3), '192.0.2.1');

  const h4 = new Headers({});
  assert.equal(getClientIp(h4), '127.0.0.1');
});

test('checkRateLimit allows requests up to max and throttles exceeding requests', () => {
  const ip = '1.2.3.4';
  const max = RATE_LIMIT_RULES.auth.max; // 20

  for (let i = 0; i < max; i++) {
    const res = checkRateLimit(ip, 'auth');
    assert.equal(res.success, true, `Request #${i + 1} should be allowed`);
    assert.equal(res.remaining, max - 1 - i);
  }

  // Next request exceeds limit
  const exceeded = checkRateLimit(ip, 'auth');
  assert.equal(exceeded.success, false);
  assert.equal(exceeded.remaining, 0);
  assert.ok(exceeded.resetSeconds > 0);

  // Different IP is unaffected (no collateral damage)
  const otherIp = checkRateLimit('5.6.7.8', 'auth');
  assert.equal(otherIp.success, true);
  assert.equal(otherIp.remaining, max - 1);
});

test('status and registration rules have independent limits', () => {
  const ip = '10.0.0.1';
  const statusRes = checkRateLimit(ip, 'status');
  const regRes = checkRateLimit(ip, 'registration');

  assert.equal(statusRes.success, true);
  assert.equal(regRes.success, true);
  assert.equal(statusRes.limit, RATE_LIMIT_RULES.status.max);
  assert.equal(regRes.limit, RATE_LIMIT_RULES.registration.max);
});
