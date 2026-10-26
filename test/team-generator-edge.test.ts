import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeededRandom,
  extractPlayersFromRegistrations,
  formatTeamsForWhatsApp,
  generateBalancedTeams,
  generateTournamentDraw,
  type PlayerParticipant,
} from '../src/lib/team-generator.ts';
import type { Registration } from '../src/types/index.ts';

const makePlayers = (n: number, gk = 0): PlayerParticipant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(3, '0')}`,
    name: `Pemain ${i}`,
    position: i < gk ? 'GK' : 'MF',
  }));

const sizes = (teams: { players: unknown[] }[]) => teams.map((t) => t.players.length);

test('odd and non-divisible counts keep team sizes within one', () => {
  for (const [n, k] of [[7, 2], [11, 3], [13, 4], [5, 6], [1, 3]] as const) {
    const teams = generateBalancedTeams(makePlayers(n), k);
    const s = sizes(teams);
    assert.equal(s.reduce((a, b) => a + b, 0), n, `all ${n} players assigned`);
    assert.ok(Math.max(...s) - Math.min(...s) <= 1, `sizes ${s} for n=${n}, k=${k}`);
    assert.equal(teams.length, Math.min(n, k), 'never creates empty teams');
  }
});

test('every player appears exactly once', () => {
  const players = makePlayers(23, 3);
  const teams = generateBalancedTeams(players, 4, undefined, { seed: 'AUDIT' });
  const ids = teams.flatMap((t) => t.players.map((p) => p.id)).sort();
  assert.deepEqual(ids, players.map((p) => p.id).sort());
});

test('goalkeepers are spread before outfield players, extras spread too', () => {
  const teams = generateBalancedTeams(makePlayers(15, 5), 3, undefined, { seed: 'GK' });
  const gkPerTeam = teams.map((t) => t.players.filter((p) => p.position === 'GK').length).sort();
  assert.deepEqual(gkPerTeam, [1, 2, 2]);
});

test('spreadFirst can be disabled for non-sport events', () => {
  const teams = generateBalancedTeams(makePlayers(6, 6), 2, undefined, {
    seed: 'X',
    spreadFirst: () => false,
  });
  assert.deepEqual(sizes(teams), [3, 3]);
});

test('same seed reproduces the same draw regardless of input order', () => {
  const players = makePlayers(14, 2);
  const a = generateBalancedTeams(players, 3, undefined, { seed: 'SEED-123' });
  const b = generateBalancedTeams([...players].reverse(), 3, undefined, { seed: 'SEED-123' });
  const c = generateBalancedTeams(players, 3, undefined, { seed: 'OTHER' });
  const ids = (teams: typeof a) => teams.map((t) => t.players.map((p) => p.id));
  assert.deepEqual(ids(a), ids(b));
  assert.notDeepEqual(ids(a), ids(c));
});

test('the extra player is not always given to the first team (no index bias)', () => {
  // 7 players / 2 teams: one team gets 4. Count how often team-1 is that team.
  let firstTeamBigger = 0;
  const runs = 400;
  for (let i = 0; i < runs; i++) {
    const teams = generateBalancedTeams(makePlayers(7), 2, undefined, { seed: `run-${i}` });
    if (teams[0].players.length === 4) firstTeamBigger++;
  }
  // Old algorithm: 400/400. Fair: about 200.
  assert.ok(firstTeamBigger > runs * 0.35 && firstTeamBigger < runs * 0.65, `got ${firstTeamBigger}/${runs}`);
});

test('seeded random is roughly uniform', () => {
  const rnd = createSeededRandom('uniform');
  const buckets = [0, 0, 0, 0];
  for (let i = 0; i < 8000; i++) buckets[Math.floor(rnd() * 4)]++;
  for (const b of buckets) assert.ok(b > 1800 && b < 2200, `bucket ${b}`);
});

test('invalid team counts are rejected', () => {
  assert.throws(() => generateBalancedTeams(makePlayers(4), 0), /minimal 1/);
  assert.throws(() => generateBalancedTeams(makePlayers(4), 1.5), /minimal 1/);
  assert.deepEqual(generateBalancedTeams([], 3), []);
});

test('extraction keeps ids unique across two repeaters and keeps back number 0', () => {
  const reg = {
    id: 'reg-1',
    event_id: 'e',
    code: 'C-1',
    total_amount: 0,
    status: 'verified',
    contact_name: 'Manajer',
    contact_phone: '08',
    contact_email: '-',
    created_at: '',
    schema_snapshot: [],
    answers: {
      team_name: 'Garuda',
      starters: [{ player_name: 'A', back_number: 0 }],
      reserves: [{ player_name: 'B', back_number: 12 }],
    },
  } as Registration;

  const players = extractPlayersFromRegistrations([reg]);
  assert.equal(players.length, 2);
  assert.equal(new Set(players.map((p) => p.id)).size, 2);
  assert.equal(players.find((p) => p.name === 'A')?.backNumber, 0);
  assert.ok(formatTeamsForWhatsApp('X', [{ id: 't', name: 'T', color: '', textColor: '', badgeBg: '', players }]).includes('A #0'));
});

test('announcement includes the seed when given', () => {
  const msg = formatTeamsForWhatsApp('Cup', [], { seed: 'ABC123' });
  assert.ok(msg.includes('ABC123'));
});

test('tournament draw is reproducible with a seed', () => {
  const teams = ['A', 'B', 'C', 'D', 'E'];
  assert.deepEqual(generateTournamentDraw(teams, 's1'), generateTournamentDraw([...teams].reverse(), 's1'));
});
