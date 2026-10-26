import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shuffleArray,
  extractPlayersFromRegistrations,
  generateBalancedTeams,
  generateTournamentDraw,
  formatTeamsForWhatsApp,
  formatTournamentForWhatsApp,
  type PlayerParticipant,
} from '../src/lib/team-generator.ts';
import type { Registration } from '../src/types/index.ts';

test('shuffleArray returns array with same elements and length', () => {
  const original = ['A', 'B', 'C', 'D', 'E'];
  const shuffled = shuffleArray(original);

  assert.equal(shuffled.length, original.length);
  assert.deepEqual(new Set(shuffled), new Set(original));
});

test('extractPlayersFromRegistrations extracts repeater players and individual contacts', () => {
  const mockRegistrations: Registration[] = [
    {
      id: 'reg-team-1',
      event_id: 'evt-1',
      code: 'MSC-001',
      total_amount: 500000,
      status: 'verified',
      contact_name: 'Manajer Budi',
      contact_phone: '081234567890',
      contact_email: 'budi@test.com',
      created_at: new Date().toISOString(),
      schema_snapshot: [],
      answers: {
        team_name: 'Garuda Muda',
        players: [
          { player_name: 'Kiper Joko', position: 'GK', back_number: 1 },
          { player_name: 'Striker Dimas', position: 'FW', back_number: 9 },
          { player_name: 'Bek Rian', position: 'DF', back_number: 4 },
        ],
      },
    },
    {
      id: 'reg-solo-1',
      event_id: 'evt-1',
      code: 'MSC-002',
      total_amount: 50000,
      status: 'verified',
      contact_name: 'Peserta Solo',
      contact_phone: '089988776655',
      contact_email: 'solo@test.com',
      created_at: new Date().toISOString(),
      schema_snapshot: [],
      answers: {},
    },
  ];

  const players = extractPlayersFromRegistrations(mockRegistrations);

  // 3 repeater players + 1 solo contact = 4 players
  assert.equal(players.length, 4);

  const gk = players.find((p) => p.name === 'Kiper Joko');
  assert.ok(gk, 'Expected Kiper Joko to be found');
  assert.equal(gk?.position, 'GK');
  assert.equal(gk?.teamOrigin, 'Garuda Muda');

  const solo = players.find((p) => p.name === 'Peserta Solo');
  assert.ok(solo, 'Expected Peserta Solo to be found');
});

test('generateBalancedTeams distributes players and balances Goalkeepers evenly', () => {
  const mockPlayers: PlayerParticipant[] = [
    { id: '1', name: 'GK 1', position: 'GK' },
    { id: '2', name: 'GK 2', position: 'GK' },
    { id: '3', name: 'Pemain A', position: 'FW' },
    { id: '4', name: 'Pemain B', position: 'DF' },
    { id: '5', name: 'Pemain C', position: 'MF' },
    { id: '6', name: 'Pemain D', position: 'MF' },
  ];

  const teams = generateBalancedTeams(mockPlayers, 2, ['Tim Merah', 'Tim Biru']);

  assert.equal(teams.length, 2);
  assert.equal(teams[0].name, 'Tim Merah');
  assert.equal(teams[1].name, 'Tim Biru');

  // Total players preserved
  const totalInTeams = teams[0].players.length + teams[1].players.length;
  assert.equal(totalInTeams, 6);

  // Both teams must have exactly 3 players
  assert.equal(teams[0].players.length, 3);
  assert.equal(teams[1].players.length, 3);

  // Goalkeepers must be distributed 1 per team
  const gkInTeam1 = teams[0].players.filter((p) => p.position === 'GK').length;
  const gkInTeam2 = teams[1].players.filter((p) => p.position === 'GK').length;

  assert.equal(gkInTeam1, 1, 'Team 1 should have exactly 1 GK');
  assert.equal(gkInTeam2, 1, 'Team 2 should have exactly 1 GK');
});

test('generateTournamentDraw creates round pairings from team list', () => {
  const teamList = ['Tim A', 'Tim B', 'Tim C', 'Tim D'];
  const matchups = generateTournamentDraw(teamList);

  assert.equal(matchups.length, 2);
  assert.equal(matchups[0].matchNumber, 1);
  assert.equal(matchups[1].matchNumber, 2);

  const matchedTeams = new Set([
    matchups[0].teamA,
    matchups[0].teamB,
    matchups[1].teamA,
    matchups[1].teamB,
  ]);
  assert.equal(matchedTeams.size, 4);
});

test('formatTeamsForWhatsApp produces formatted announcement with player names', () => {
  const teams = [
    {
      id: 'team-1',
      name: 'Tim Merah',
      color: '#ef4444',
      textColor: '#ffffff',
      badgeBg: 'bg-red-500',
      players: [
        { id: '1', name: 'Kiper Andi', position: 'GK', backNumber: 1 },
        { id: '2', name: 'Striker Budi', position: 'FW', backNumber: 10 },
      ],
    },
  ];

  const message = formatTeamsForWhatsApp('Mini Soccer Cup', teams);

  assert.ok(message.includes('HASIL DRAWING PEMBAGIAN TIM'));
  assert.ok(message.includes('Mini Soccer Cup'));
  assert.ok(message.includes('TIM MERAH'));
  assert.ok(message.includes('Kiper Andi #1 [GK]'));
  assert.ok(message.includes('Striker Budi #10 [FW]'));
});

test('generateTournamentDraw handles odd number of teams with BYE', () => {
  const teams = ['Tim Alpha', 'Tim Beta', 'Tim Gamma'];
  const matchups = generateTournamentDraw(teams);

  assert.equal(matchups.length, 2);
  const byeMatch = matchups.find((m) => m.teamB.includes('BYE'));
  assert.ok(byeMatch, 'Expected a BYE match for odd teams count');
});

test('formatTournamentForWhatsApp produces formatted match schedule announcement', () => {
  const matchups = [
    {
      id: 'm-1',
      matchNumber: 1,
      roundName: 'Babak 1',
      teamA: 'Tim Harimau',
      teamB: 'Tim Rajawali',
    },
  ];

  const message = formatTournamentForWhatsApp('Piala Kemerdekaan', matchups);
  assert.ok(message.includes('HASIL UNDIAN BAGAN PERTANDINGAN'));
  assert.ok(message.includes('Piala Kemerdekaan'));
  assert.ok(message.includes('*Tim Harimau* vs *Tim Rajawali*'));
});
