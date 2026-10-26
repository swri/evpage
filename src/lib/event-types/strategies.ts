import { createTeamShells, generateBalancedTeams, minimumTeamsFor, type PlayerParticipant } from '../team-generator.ts';
import type { GroupingStrategy } from './types.ts';

const noOne = () => false;

/** Random but fair: size balance, event-type priority role, optional constraints. */
export const balancedStrategy: GroupingStrategy = {
  id: 'balanced',
  label: 'Acak seimbang',
  description: 'Acak dengan seed; ukuran sama rata, peran prioritas disebar, batasan opsional dihormati.',
  usesSeed: true,
  build: (players, ctx) =>
    generateBalancedTeams(players, ctx.teamCount, ctx.teamNames, {
      seed: ctx.seed,
      spreadFirst: ctx.spreadFirst ?? noOne,
      ...ctx.constraints,
    }),
};

/** Plain random split; ignores roles and levels. */
export const randomStrategy: GroupingStrategy = {
  id: 'random',
  label: 'Acak murni',
  description: 'Acak dengan seed tanpa memperhatikan peran atau level; hanya ukuran yang diseimbangkan.',
  usesSeed: true,
  build: (players, ctx) =>
    generateBalancedTeams(players, ctx.teamCount, ctx.teamNames, {
      seed: ctx.seed,
      spreadFirst: noOne,
      maxPerTeam: ctx.constraints.maxPerTeam,
    }),
};

/** Seeding by level: strongest first into the weakest group (pots). */
export const seededStrategy: GroupingStrategy = {
  id: 'seeded',
  label: 'Seeding berdasarkan level',
  description: 'Peserta dengan level tertinggi dibagikan lebih dulu ke kelompok terlemah; seed hanya menentukan level yang sama.',
  usesSeed: true,
  build: (players, ctx) =>
    generateBalancedTeams(players, ctx.teamCount, ctx.teamNames, {
      seed: ctx.seed,
      spreadFirst: ctx.spreadFirst ?? noOne,
      ...ctx.constraints,
      balanceLevel: true,
    }),
};

/**
 * Deterministic starting point for organizers who arrange groups by hand:
 * alphabetical, dealt round-robin. No randomness, so no seed.
 */
export const manualStrategy: GroupingStrategy = {
  id: 'manual',
  label: 'Manual',
  description: 'Mulai dari urutan abjad yang dibagi bergiliran, lalu pindahkan peserta secara manual.',
  usesSeed: false,
  build: (players, ctx) => {
    if (!Number.isInteger(ctx.teamCount) || ctx.teamCount <= 0) throw new Error('Jumlah tim minimal 1');
    const max = ctx.constraints.maxPerTeam;
    if (max && ctx.teamCount < minimumTeamsFor(players.length, max)) {
      throw new Error(`Butuh minimal ${minimumTeamsFor(players.length, max)} kelompok untuk maksimal ${max} per kelompok`);
    }
    const sorted = [...players].sort(
      (a: PlayerParticipant, b: PlayerParticipant) => a.name.localeCompare(b.name, 'id') || a.id.localeCompare(b.id)
    );
    const teams = createTeamShells(Math.min(ctx.teamCount, Math.max(1, sorted.length)), ctx.teamNames);
    sorted.forEach((p, i) => teams[i % teams.length].players.push(p));
    return teams;
  },
};

export const GROUPING_STRATEGIES: Record<string, GroupingStrategy> = {
  [balancedStrategy.id]: balancedStrategy,
  [randomStrategy.id]: randomStrategy,
  [seededStrategy.id]: seededStrategy,
  [manualStrategy.id]: manualStrategy,
};

/** Adds or replaces a strategy (e.g. from a custom event-type module). */
export function registerGroupingStrategy(strategy: GroupingStrategy): void {
  GROUPING_STRATEGIES[strategy.id] = strategy;
}

export function getGroupingStrategy(id: string | undefined): GroupingStrategy {
  return (id && GROUPING_STRATEGIES[id]) || balancedStrategy;
}
