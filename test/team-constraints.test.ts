import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bySameOrigin,
  countSeparationConflicts,
  extractPlayersFromRegistrations,
  generateBalancedTeams,
  minimumTeamsFor,
  teamLevel,
  type PlayerParticipant,
} from '../src/lib/team-generator.ts';
import type { Registration } from '../src/types/index.ts';

const player = (id: string, extra: Partial<PlayerParticipant> = {}): PlayerParticipant => ({
  id,
  name: id,
  position: 'MF',
  ...extra,
});

test('separateBy keeps players from the same club apart when sizes allow', () => {
  // 3 clubs x 3 players into 3 teams: a perfect separation exists
  const players = ['A', 'B', 'C'].flatMap((club) =>
    [1, 2, 3].map((n) => player(`${club}${n}`, { teamOrigin: `Klub ${club}` }))
  );
  for (let i = 0; i < 50; i++) {
    const teams = generateBalancedTeams(players, 3, undefined, { seed: `sep-${i}`, separateBy: bySameOrigin });
    assert.equal(countSeparationConflicts(teams, bySameOrigin), 0, `seed sep-${i}`);
  }
});

test('separation never breaks size balance and reports unavoidable clashes', () => {
  // 4 players from one club into 2 teams: clashes are unavoidable
  const players = [1, 2, 3, 4].map((n) => player(`X${n}`, { teamOrigin: 'Klub X' }));
  const teams = generateBalancedTeams(players, 2, undefined, { seed: 's', separateBy: bySameOrigin });
  assert.deepEqual(teams.map((t) => t.players.length), [2, 2]);
  assert.equal(countSeparationConflicts(teams, bySameOrigin), 2);
});

test('balanceLevel keeps team strength close', () => {
  const levels = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
  const players = levels.map((level, i) => player(`p${i}`, { level }));
  for (let i = 0; i < 30; i++) {
    const teams = generateBalancedTeams(players, 2, undefined, { seed: `lvl-${i}`, balanceLevel: true });
    const [a, b] = teams.map(teamLevel);
    assert.ok(Math.abs(a - b) <= 2, `levels ${a} vs ${b}`);
  }
  // Without balancing, the strongest players can stack (sanity check that the option matters)
  const unbalanced = Array.from({ length: 200 }, (_, i) =>
    generateBalancedTeams(players, 2, undefined, { seed: `raw-${i}` }).map(teamLevel)
  ).some(([a, b]) => Math.abs(a - b) > 2);
  assert.ok(unbalanced);
});

test('maxPerTeam rejects too few teams and is respected otherwise', () => {
  const players = Array.from({ length: 23 }, (_, i) => player(`p${i}`));
  assert.equal(minimumTeamsFor(23, 7), 4);
  assert.throws(() => generateBalancedTeams(players, 3, undefined, { maxPerTeam: 7 }), /butuh minimal 4 tim/);
  const teams = generateBalancedTeams(players, 4, undefined, { seed: 'max', maxPerTeam: 7 });
  assert.ok(teams.every((t) => t.players.length <= 7));
  assert.throws(() => generateBalancedTeams(players, 4, undefined, { maxPerTeam: 0 }), /minimal 1/);
});

test('constraints are reproducible with the same seed', () => {
  const players = Array.from({ length: 12 }, (_, i) =>
    player(`p${i}`, { level: (i % 5) + 1, teamOrigin: `Klub ${i % 3}` })
  );
  const opts = { seed: 'repro', separateBy: bySameOrigin, balanceLevel: true };
  const a = generateBalancedTeams(players, 3, undefined, opts);
  const b = generateBalancedTeams([...players].reverse(), 3, undefined, opts);
  assert.deepEqual(a.map((t) => t.players.map((p) => p.id)), b.map((t) => t.players.map((p) => p.id)));
});

test('levels are read from repeater rows and individual answers', () => {
  const regs = [
    {
      id: 'r1', event_id: 'e', code: 'C1', total_amount: 0, status: 'verified', contact_name: 'M',
      contact_phone: '', contact_email: '', created_at: '', schema_snapshot: [],
      answers: { players: [{ name: 'A', level: '4' }, { name: 'B', skill: 2 }, { name: 'C', level: 'tinggi' }] },
    },
    {
      id: 'r2', event_id: 'e', code: 'C2', total_amount: 0, status: 'verified', contact_name: 'Solo',
      contact_phone: '', contact_email: '', created_at: '', schema_snapshot: [], answers: { rating: 3 },
    },
  ] as Registration[];
  const byName = Object.fromEntries(extractPlayersFromRegistrations(regs).map((p) => [p.name, p.level]));
  assert.deepEqual(byName, { A: 4, B: 2, C: undefined, Solo: 3 });
});
