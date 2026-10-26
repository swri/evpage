import type { Registration } from '../types/index.ts';

export type SoccerPosition = 'GK' | 'DF' | 'MF' | 'FW' | string;

export interface PlayerParticipant {
  id: string;
  name: string;
  registrationCode?: string;
  contactPhone?: string;
  teamOrigin?: string;
  position?: SoccerPosition;
  backNumber?: number | string;
  level?: number;
}

export interface GeneratedTeam {
  id: string;
  name: string;
  color: string;
  textColor: string;
  badgeBg: string;
  players: PlayerParticipant[];
}

export interface TournamentMatchup {
  matchNumber: number;
  roundName: string;
  teamA: string;
  teamB: string;
}

export const DEFAULT_TEAM_CONFIGS = [
  { name: 'Tim Merah (Red)', color: '#ef4444', textColor: '#ffffff', badgeBg: 'bg-red-500 text-white' },
  { name: 'Tim Biru (Blue)', color: '#3b82f6', textColor: '#ffffff', badgeBg: 'bg-blue-500 text-white' },
  { name: 'Tim Hijau (Green)', color: '#10b981', textColor: '#ffffff', badgeBg: 'bg-emerald-500 text-white' },
  { name: 'Tim Hitam (Black)', color: '#18181b', textColor: '#ffffff', badgeBg: 'bg-neutral-900 text-white' },
  { name: 'Tim Putih (White)', color: '#f4f4f5', textColor: '#18181b', badgeBg: 'bg-neutral-200 text-neutral-900 border border-neutral-300' },
  { name: 'Tim Kuning (Yellow)', color: '#eab308', textColor: '#18181b', badgeBg: 'bg-amber-400 text-neutral-900' },
];

// ==========================================
// Randomness (seedable, so a draw can be replayed and audited)
// ==========================================
export type RandomFn = () => number;

/** Short human-readable seed that organizers can announce with the result. */
export function generateSeed(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/**
 * Deterministic PRNG from a string seed (xmur3 hash + mulberry32).
 * Same seed + same participant list => same teams.
 */
export function createSeededRandom(seed: string): RandomFn {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Modern Fisher-Yates array shuffling
 */
export function shuffleArray<T>(items: T[], random: RandomFn = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ==========================================
// Participant extraction
// ==========================================
// Answer keys recognised in repeater rows. Mini soccer templates use the
// Indonesian names; generic events usually use name/role.
export const PLAYER_NAME_KEYS = ['player_name', 'nama_pemain', 'name', 'nama'];
export const PLAYER_ROLE_KEYS = ['position', 'posisi', 'role'];
export const PLAYER_NUMBER_KEYS = ['back_number', 'no_punggung'];
export const GROUP_ORIGIN_KEYS = ['team_name', 'nama_tim'];
/** Numeric skill rating used by balanceLevel (e.g. 1-5) */
export const PLAYER_LEVEL_KEYS = ['level', 'skill', 'rating', 'tingkat'];

function parseLevel(value: unknown): number | undefined {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) ? n : undefined;
}

function firstPresent(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

/**
 * Extracts player participants from registration records.
 * Supports both repeater team players and single-entry participants.
 */
export function extractPlayersFromRegistrations(registrations: Registration[]): PlayerParticipant[] {
  const result: PlayerParticipant[] = [];

  registrations.forEach((reg) => {
    const answers = reg.answers || {};
    const origin = firstPresent(answers, GROUP_ORIGIN_KEYS) as string | undefined;
    let foundRepeaterPlayers = false;

    for (const key of Object.keys(answers)) {
      const val = answers[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        val.forEach((item: Record<string, unknown>, idx: number) => {
          const playerName = firstPresent(item, PLAYER_NAME_KEYS);
          if (playerName === undefined) return;

          foundRepeaterPlayers = true;
          const position = firstPresent(item, PLAYER_ROLE_KEYS);
          const backNumber = firstPresent(item, PLAYER_NUMBER_KEYS) as number | string | undefined;

          result.push({
            // Field key is part of the id: two repeaters in one registration
            // would otherwise produce colliding ids.
            id: `${reg.id}-${key}-${idx}`,
            name: String(playerName).trim(),
            registrationCode: reg.code,
            contactPhone: reg.contact_phone,
            teamOrigin: origin || reg.contact_name,
            position: position !== undefined ? String(position).toUpperCase() : undefined,
            backNumber,
            level: parseLevel(firstPresent(item, PLAYER_LEVEL_KEYS)),
          });
        });
      }
    }

    // Fallback: If no repeater was found, treat contact_name as individual player
    if (!foundRepeaterPlayers && reg.contact_name) {
      const position = firstPresent(answers, PLAYER_ROLE_KEYS);
      result.push({
        id: `${reg.id}-individual`,
        name: reg.contact_name,
        registrationCode: reg.code,
        contactPhone: reg.contact_phone,
        teamOrigin: origin || 'Peserta Mandiri',
        position: position !== undefined ? String(position).toUpperCase() : undefined,
        level: parseLevel(firstPresent(answers, PLAYER_LEVEL_KEYS)),
      });
    }
  });

  return result;
}

// ==========================================
// Team generation
// ==========================================
/**
 * Mini soccer rule: goalkeepers are spread across teams before anyone else.
 * Other event types can pass their own predicate or `() => false`.
 */
export function isSoccerGoalkeeper(p: PlayerParticipant): boolean {
  const pos = (p.position || '').toUpperCase();
  return pos === 'GK' || pos.includes('KIPER') || pos.includes('GOAL');
}

export interface TeamGenerationOptions {
  /** Replays the exact same draw for the same participant list. */
  seed?: string;
  /** Participants matching this are distributed first, one per team in turn. */
  spreadFirst?: (p: PlayerParticipant) => boolean;
  /** Keep participants with the same key apart where sizes allow (e.g. same club). */
  separateBy?: (p: PlayerParticipant) => string | undefined;
  /** Even out the sum of `level` per team. */
  balanceLevel?: boolean;
  /** Hard cap per team; throws when teamCount cannot hold everyone. */
  maxPerTeam?: number;
}

/** Stored with saved draws so an old result can be replayed with the same code. */
export const TEAM_ALGORITHM_VERSION = 'balanced-v2';

/** separateBy preset: participants registered under the same team/club name */
export const bySameOrigin = (p: PlayerParticipant) => p.teamOrigin?.trim().toLowerCase() || undefined;

/**
 * Splits participants into N balanced teams (sizes differ by at most one).
 * Players matching `spreadFirst` (default: goalkeepers) are dealt first so
 * they end up evenly spread. Ties are broken randomly, so no team is
 * systematically favoured with the extra player.
 */
export function generateBalancedTeams(
  players: PlayerParticipant[],
  teamCount: number,
  customTeamNames?: string[],
  options: TeamGenerationOptions = {}
): GeneratedTeam[] {
  if (!Number.isInteger(teamCount) || teamCount <= 0) throw new Error('Jumlah tim minimal 1');
  if (players.length === 0) return [];
  if (options.maxPerTeam !== undefined) {
    if (!Number.isInteger(options.maxPerTeam) || options.maxPerTeam <= 0) {
      throw new Error('Maksimal anggota per tim minimal 1');
    }
    const needed = minimumTeamsFor(players.length, options.maxPerTeam);
    if (teamCount < needed) {
      throw new Error(
        `${players.length} peserta dengan maksimal ${options.maxPerTeam} per tim butuh minimal ${needed} tim`
      );
    }
  }

  const random = options.seed ? createSeededRandom(options.seed) : Math.random;
  const spreadFirst = options.spreadFirst ?? isSoccerGoalkeeper;

  // More teams than players would leave empty teams
  const safeCount = Math.min(teamCount, players.length);
  const teams: GeneratedTeam[] = [];

  for (let i = 0; i < safeCount; i++) {
    const config = DEFAULT_TEAM_CONFIGS[i % DEFAULT_TEAM_CONFIGS.length];
    const customName = customTeamNames?.[i]?.trim();

    teams.push({
      id: `team-${i + 1}`,
      name: customName || config.name,
      color: config.color,
      textColor: config.textColor,
      badgeBg: config.badgeBg,
      players: [],
    });
  }

  // Sort first so the result depends only on who participates, not on the
  // order registrations were loaded in.
  const ordered = [...players].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const priority = shuffleArray(ordered.filter(spreadFirst), random);
  const others = shuffleArray(ordered.filter((p) => !spreadFirst(p)), random);

  const separateBy = options.separateBy;
  const keyOf = (p: PlayerParticipant) => (separateBy ? separateBy(p) || undefined : undefined);

  // Each filter only narrows the candidate list, and the final pick is the
  // single random() call, so draws without constraints stay reproducible.
  const assign = (player: PlayerParticipant) => {
    const minSize = Math.min(...teams.map((t) => t.players.length));
    let candidates = teams.filter((t) => t.players.length === minSize);

    const key = keyOf(player);
    if (key !== undefined) {
      const clash = (t: GeneratedTeam) => t.players.filter((p) => keyOf(p) === key).length;
      const least = Math.min(...candidates.map(clash));
      candidates = candidates.filter((t) => clash(t) === least);
    }
    if (options.balanceLevel) {
      const lowest = Math.min(...candidates.map(teamLevel));
      candidates = candidates.filter((t) => teamLevel(t) === lowest);
    }
    candidates[Math.floor(random() * candidates.length)].players.push(player);
  };

  // Strongest first, so each next player goes to the currently weakest team
  const order = (list: PlayerParticipant[]) => {
    const leveled = options.balanceLevel ? sortByLevelDesc(list) : list;
    return separateBy ? groupLargestFirst(leveled, keyOf) : leveled;
  };
  order(priority).forEach(assign);
  order(others).forEach(assign);

  return teams;
}

/**
 * Deals members of the same group consecutively, biggest group first.
 * A plain random order can paint the greedy step into a corner where the
 * only team left with room already holds that club.
 */
function groupLargestFirst(
  players: PlayerParticipant[],
  keyOf: (p: PlayerParticipant) => string | undefined
): PlayerParticipant[] {
  const groups = new Map<string, PlayerParticipant[]>();
  const loose: PlayerParticipant[] = [];
  for (const p of players) {
    const key = keyOf(p);
    if (key === undefined) loose.push(p);
    else groups.set(key, [...(groups.get(key) || []), p]);
  }
  // Map keeps first-seen order, which already reflects the seeded shuffle
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  return [...sorted.flat(), ...loose];
}

/** Stable on equal levels, so the earlier shuffle still decides ties. */
function sortByLevelDesc(players: PlayerParticipant[]): PlayerParticipant[] {
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.level ?? 0) - (a.p.level ?? 0) || a.i - b.i)
    .map((x) => x.p);
}

export function teamLevel(team: GeneratedTeam): number {
  return team.players.reduce((sum, p) => sum + (p.level ?? 0), 0);
}

/**
 * Pairs of teammates sharing a separateBy key (e.g. from the same club).
 * Shown to organizers so they can see when separation was impossible.
 */
export function countSeparationConflicts(
  teams: GeneratedTeam[],
  separateBy: (p: PlayerParticipant) => string | undefined
): number {
  let conflicts = 0;
  for (const team of teams) {
    const counts = new Map<string, number>();
    for (const p of team.players) {
      const key = separateBy(p);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const n of counts.values()) conflicts += (n * (n - 1)) / 2;
  }
  return conflicts;
}

/** Smallest number of teams that respects a per-team maximum. */
export function minimumTeamsFor(playerCount: number, maxPerTeam: number): number {
  return Math.ceil(playerCount / Math.max(1, maxPerTeam));
}

/**
 * Generates tournament matchups (bracket / draw) from team names.
 */
export function generateTournamentDraw(teamNames: string[], seed?: string): TournamentMatchup[] {
  const cleanTeams = teamNames.map((t) => t.trim()).filter(Boolean);
  if (cleanTeams.length < 2) return [];

  const random = seed ? createSeededRandom(seed) : Math.random;
  const shuffled = shuffleArray([...cleanTeams].sort(), random);
  const matchups: TournamentMatchup[] = [];

  let matchNum = 1;
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      matchups.push({
        matchNumber: matchNum++,
        roundName: `Match #${matchNum - 1}`,
        teamA: shuffled[i],
        teamB: shuffled[i + 1],
      });
    } else {
      // Bye (lone team advancing or waiting)
      matchups.push({
        matchNumber: matchNum++,
        roundName: `Match #${matchNum - 1} (Bye)`,
        teamA: shuffled[i],
        teamB: 'BYE (Lolos Otomatis)',
      });
    }
  }

  return matchups;
}

// ==========================================
// Announcements
// ==========================================
export interface AnnouncementLabels {
  heading: string;
  memberLabel: string;
  closingNote: string;
}

export const SOCCER_ANNOUNCEMENT_LABELS: AnnouncementLabels = {
  heading: '⚽ *HASIL DRAWING PEMBAGIAN TIM*',
  memberLabel: 'Pemain',
  closingNote: 'Semua pemain dimohon siap di lapangan 15 menit sebelum kick-off. Junjung tinggi sportivitas! 🏆',
};

/**
 * Formats generated teams into ready-to-send WhatsApp announcement message.
 * Pass the seed so participants can verify the draw was not hand-picked.
 */
export function formatTeamsForWhatsApp(
  eventTitle: string,
  teams: GeneratedTeam[],
  options: { seed?: string; labels?: AnnouncementLabels } = {}
): string {
  const labels = options.labels ?? SOCCER_ANNOUNCEMENT_LABELS;
  const lines: string[] = [
    labels.heading,
    `Event: *${eventTitle}*`,
    `Waktu Pengacakan: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`,
  ];
  if (options.seed) lines.push(`Kode Acak (seed): ${options.seed}`);
  lines.push(`----------------------------------------`);

  teams.forEach((t) => {
    lines.push(`\n👕 *${t.name.toUpperCase()}* (${t.players.length} ${labels.memberLabel})`);
    t.players.forEach((p, idx) => {
      const pos = p.position ? ` [${p.position}]` : '';
      const hasNumber = p.backNumber !== undefined && p.backNumber !== null && String(p.backNumber) !== '';
      const no = hasNumber ? ` #${p.backNumber}` : '';
      lines.push(`${idx + 1}. ${p.name}${no}${pos}`);
    });
  });

  lines.push(`\n----------------------------------------`);
  lines.push(labels.closingNote);

  return lines.join('\n');
}

/**
 * Formats tournament bracket draw into WhatsApp message.
 */
export function formatTournamentForWhatsApp(eventTitle: string, matchups: TournamentMatchup[]): string {
  const lines: string[] = [
    `🏆 *HASIL UNDIAN BAGAN PERTANDINGAN*`,
    `Event: *${eventTitle}*`,
    `----------------------------------------`,
  ];

  matchups.forEach((m) => {
    lines.push(`\n⚔️ *${m.roundName}*`);
    lines.push(`👉 *${m.teamA}* vs *${m.teamB}*`);
  });

  lines.push(`\n----------------------------------------`);
  lines.push(`Jadwal detail & lapangan akan segera diumumkan panitia.`);

  return lines.join('\n');
}
