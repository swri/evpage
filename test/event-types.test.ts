import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPING_STRATEGIES,
  getEventType,
  getGroupingStrategy,
  listEventTypes,
  registerEventType,
  resolveEventType,
  type EventTypeModule,
} from '../src/lib/event-types/index.ts';
import { BUILT_IN_TEMPLATES } from '../src/lib/data-service.ts';
import type { PlayerParticipant } from '../src/lib/team-generator.ts';

const players: PlayerParticipant[] = [
  { id: 'a', name: 'Citra', position: 'GK' },
  { id: 'b', name: 'Andi', position: 'GK' },
  { id: 'c', name: 'Budi', position: 'MF' },
  { id: 'd', name: 'Dewi', position: 'MF' },
];

test('unknown or missing types fall back to the general module', () => {
  assert.equal(getEventType(undefined).id, 'general');
  assert.equal(getEventType('belum-ada').id, 'general');
});

test('every module references existing strategies and templates', () => {
  const templateIds = new Set(BUILT_IN_TEMPLATES.map((t) => t.id));
  for (const m of listEventTypes()) {
    for (const s of m.grouping.strategies) assert.ok(GROUPING_STRATEGIES[s], `${m.id} uses unknown strategy ${s}`);
    if (m.templateId) assert.ok(templateIds.has(m.templateId), `${m.id} uses unknown template ${m.templateId}`);
  }
});

test('only the mini soccer module spreads goalkeepers', () => {
  const soccer = getEventType('mini-soccer');
  const general = getEventType('general');
  const build = (spreadFirst: EventTypeModule['grouping']['spreadFirst']) =>
    getGroupingStrategy('balanced').build(players, { teamCount: 2, seed: 'x', spreadFirst, constraints: {} });

  const soccerTeams = build(soccer.grouping.spreadFirst);
  assert.deepEqual(soccerTeams.map((t) => t.players.filter((p) => p.position === 'GK').length), [1, 1]);
  assert.equal(general.grouping.spreadFirst, undefined);
  assert.equal(soccer.labels.participant, 'Pemain');
  assert.equal(general.labels.participant, 'Peserta');
});

test('per-event type_config overrides labels and grouping without touching the module', () => {
  const resolved = resolveEventType({
    event_type: 'mini-soccer',
    type_config: { labels: { group: 'Skuad' }, grouping: { defaultGroupCount: 4 }, announcement: { closingNote: 'Bawa sepatu futsal.' } },
  });
  assert.equal(resolved.labels.group, 'Skuad');
  assert.equal(resolved.labels.participant, 'Pemain');
  assert.equal(resolved.grouping.defaultGroupCount, 4);
  assert.equal(resolved.grouping.announcement.closingNote, 'Bawa sepatu futsal.');
  assert.equal(getEventType('mini-soccer').labels.group, 'Tim', 'base module unchanged');
  assert.equal(resolved.grouping.spreadFirst, getEventType('mini-soccer').grouping.spreadFirst, 'behaviour kept');
});

test('manual strategy is deterministic, alphabetical, round-robin', () => {
  const teams = getGroupingStrategy('manual').build(players, { teamCount: 2, constraints: {} });
  assert.deepEqual(teams.map((t) => t.players.map((p) => p.name)), [['Andi', 'Citra'], ['Budi', 'Dewi']]);
  assert.throws(() => getGroupingStrategy('manual').build(players, { teamCount: 1, constraints: { maxPerTeam: 2 } }), /minimal 2/);
});

test('seeded strategy always balances by level', () => {
  const leveled = [5, 5, 1, 1].map((level, i) => ({ id: `p${i}`, name: `P${i}`, level }));
  const teams = getGroupingStrategy('seeded').build(leveled, { teamCount: 2, seed: 's', constraints: {} });
  assert.deepEqual(teams.map((t) => t.players.reduce((s, p) => s + (p.level ?? 0), 0)), [6, 6]);
});

test('a new event type can be registered without changing the core', () => {
  registerEventType({
    ...getEventType('general'),
    id: 'esports',
    label: 'Turnamen E-sports',
    labels: { participant: 'Pemain', participants: 'Pemain', group: 'Squad', groups: 'Squad', groupingAction: 'Acak Squad' },
  });
  assert.equal(resolveEventType({ event_type: 'esports' }).labels.group, 'Squad');
  assert.ok(listEventTypes().some((m) => m.id === 'esports'));
});
