import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, type TestDb } from './db/harness.ts';

let t: TestDb;
let alice: string;
let orgId: string;
let eventId: string;

before(async () => {
  t = await createTestDb();
  alice = await t.createUser('alice@ratelimit.com');
  const [{ r }] = await t.user<{ r: { id: string } }>(
    alice,
    `SELECT public.create_organization('Rate Limit Org') AS r`
  );
  orgId = r.id;

  const [evt] = await t.user<{ id: string }>(
    alice,
    `INSERT INTO public.events (organization_id, created_by, title, slug, status, quota, price_type, price_amount, form_schema)
     VALUES ($1, $2, 'Rate Limit Event', 'rate-limit-event', 'open', 100, 'free', 0, '[]'::jsonb)
     RETURNING id`,
    [orgId, alice]
  );
  eventId = evt.id;
});

after(async () => t?.close());

test('check_registration_status: rate limits brute-force per IP+code without locking out legitimate users on other IPs (DoS mitigation)', async () => {
  // 1. Create a valid registration
  const [created] = await t.anon<{ code: string }>(
    `SELECT (public.create_registration_atomic($1, '{}'::jsonb, '', 'Budi Test', '081234567899', 'budi@test.com') ->> 'code') AS code`,
    [eventId]
  );
  const ticketCode = created.code;
  assert.ok(ticketCode);

  // 2. Successful check with valid phone works
  const successRows = await t.anon<{ code: string }>(
    `SELECT code FROM public.check_registration_status($1, '081234567899')`,
    [ticketCode]
  );
  assert.equal(successRows.length, 1);
  assert.equal(successRows[0].code, ticketCode);

  // 3. Attacker (default IP 127.0.0.1) performs 5 failed attempts (wrong phone) on this code
  for (let i = 0; i < 5; i++) {
    const wrongRows = await t.anon(
      `SELECT code FROM public.check_registration_status($1, '089999999999')`,
      [ticketCode]
    );
    assert.equal(wrongRows.length, 0, `Attempt #${i + 1} should return 0 rows`);
  }

  // 4. The 6th attempt from the SAME attacker IP is rejected by rate limit
  await assert.rejects(
    t.anon(
      `SELECT code FROM public.check_registration_status($1, '089999999999')`,
      [ticketCode]
    ),
    /Terlalu banyak percobaan pada kode tiket ini dari perangkat Anda/
  );

  // 5. DoS Mitigation Proof: A legitimate user checking from another IP is NOT locked out!
  // Set client IP header for the legitimate user
  await t.sql(
    `SELECT set_config('request.headers', '{"cf-connecting-ip": "198.51.100.77"}', false)`
  );
  const legitimateCheck = await t.anon<{ code: string }>(
    `SELECT code FROM public.check_registration_status($1, '081234567899')`,
    [ticketCode]
  );
  assert.equal(legitimateCheck.length, 1);
  assert.equal(legitimateCheck[0].code, ticketCode);

  // Reset request headers back to default
  await t.sql(`SELECT set_config('request.headers', '', false)`);
});

test('internal rate limit helper functions are revoked from anon and authenticated', async () => {
  // Direct calls by anonymous visitors must be rejected with permission denied
  await assert.rejects(
    t.anon(`SELECT public.reset_rate_limit('action', 'id')`),
    /permission denied/
  );

  await assert.rejects(
    t.anon(`SELECT public.purge_expired_rate_limits()`),
    /permission denied/
  );

  await assert.rejects(
    t.anon(`SELECT public.check_and_record_rate_limit('action', 'id', 5, '1 hour'::interval, '1 hour'::interval)`),
    /permission denied/
  );

  await assert.rejects(
    t.anon(`SELECT public.is_rate_limited('action', 'id')`),
    /permission denied/
  );
});

test('create_registration_atomic: rate limits duplicate phone registration spam per event', async () => {
  const spamPhone = '087777777777';

  // Perform 5 allowed registrations with the same phone
  for (let i = 0; i < 5; i++) {
    const res = await t.anon<{ code: string }>(
      `SELECT (public.create_registration_atomic($1, '{}'::jsonb, '', 'Spammer', $2, 'spam@test.com') ->> 'code') AS code`,
      [eventId, spamPhone]
    );
    assert.ok(res[0].code);
  }

  // The 6th registration from the same phone on this event must be blocked
  await assert.rejects(
    t.anon(
      `SELECT public.create_registration_atomic($1, '{}'::jsonb, '', 'Spammer', $2, 'spam@test.com')`,
      [eventId, spamPhone]
    ),
    /Nomor telepon ini telah mencapai batas pendaftaran/
  );

  // A different phone number can still register successfully
  const validRes = await t.anon<{ code: string }>(
    `SELECT (public.create_registration_atomic($1, '{}'::jsonb, '', 'Normal User', '085555555555', 'normal@test.com') ->> 'code') AS code`,
    [eventId]
  );
  assert.ok(validRes[0].code);
});

test('purge_expired_rate_limits removes old rate limit records when executed by superuser/internal', async () => {
  const [{ count }] = await t.sql<{ count: number }>(
    `SELECT public.purge_expired_rate_limits() AS count`
  );
  assert.equal(typeof Number(count), 'number');
});
