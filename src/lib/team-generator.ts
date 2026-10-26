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

/**
 * Modern Fisher-Yates array shuffling
 */
export function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Extracts player participants from registration records.
 * Supports both repeater team players and single-entry participants.
 */
export function extractPlayersFromRegistrations(registrations: Registration[]): PlayerParticipant[] {
  const result: PlayerParticipant[] = [];

  registrations.forEach((reg) => {
    // Check if there is repeater data with players
    const answers = reg.answers || {};
    let foundRepeaterPlayers = false;

    for (const key of Object.keys(answers)) {
      const val = answers[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
        // Look for player properties
        val.forEach((item: Record<string, unknown>, idx: number) => {
          const playerName =
            (item.player_name as string) ||
            (item.nama_pemain as string) ||
            (item.name as string) ||
            (item.nama as string);

          if (playerName && String(playerName).trim()) {
            foundRepeaterPlayers = true;
            const position =
              (item.position as string) ||
              (item.posisi as string) ||
              (item.role as string) ||
              undefined;
            const backNumber =
              (item.back_number as number | string) ||
              (item.no_punggung as number | string) ||
              undefined;

            result.push({
              id: `${reg.id}-player-${idx}`,
              name: String(playerName).trim(),
              registrationCode: reg.code,
              contactPhone: reg.contact_phone,
              teamOrigin: (answers.team_name as string) || (answers.nama_tim as string) || reg.contact_name,
              position: position ? String(position).toUpperCase() : undefined,
              backNumber,
            });
          }
        });
      }
    }

    // Fallback: If no repeater was found, treat contact_name as individual player
    if (!foundRepeaterPlayers && reg.contact_name) {
      result.push({
        id: `${reg.id}-individual`,
        name: reg.contact_name,
        registrationCode: reg.code,
        contactPhone: reg.contact_phone,
        teamOrigin: (answers.team_name as string) || 'Peserta Mandiri',
        position: (answers.position as string) || undefined,
      });
    }
  });

  return result;
}

/**
 * Splits participants into N balanced teams.
 * If position metadata (GK, DF, MF, FW) exists, ensures Goalkeepers are distributed evenly first.
 */
export function generateBalancedTeams(
  players: PlayerParticipant[],
  teamCount: number,
  customTeamNames?: string[]
): GeneratedTeam[] {
  if (teamCount <= 0) throw new Error('Jumlah tim minimal 1');
  if (players.length === 0) return [];

  // Initialize teams
  const safeCount = Math.min(teamCount, Math.max(1, players.length));
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

  // Separate Goalkeepers (GK) from other players
  const goalkeepers: PlayerParticipant[] = [];
  const outfieldPlayers: PlayerParticipant[] = [];

  players.forEach((p) => {
    const pos = (p.position || '').toUpperCase();
    if (pos === 'GK' || pos.includes('KIPER') || pos.includes('GOAL')) {
      goalkeepers.push(p);
    } else {
      outfieldPlayers.push(p);
    }
  });

  // Shuffle both groups
  const shuffledGKs = shuffleArray(goalkeepers);
  const shuffledOutfield = shuffleArray(outfieldPlayers);

  // Distribute GKs round-robin across teams
  shuffledGKs.forEach((gk, index) => {
    const teamIndex = index % safeCount;
    teams[teamIndex].players.push(gk);
  });

  // Distribute outfield players round-robin, starting from team with fewest players
  shuffledOutfield.forEach((player) => {
    // Find team with minimum players
    let minTeamIndex = 0;
    for (let i = 1; i < safeCount; i++) {
      if (teams[i].players.length < teams[minTeamIndex].players.length) {
        minTeamIndex = i;
      }
    }
    teams[minTeamIndex].players.push(player);
  });

  return teams;
}

/**
 * Generates tournament matchups (bracket / draw) from team names.
 */
export function generateTournamentDraw(teamNames: string[]): TournamentMatchup[] {
  const cleanTeams = teamNames.map((t) => t.trim()).filter(Boolean);
  if (cleanTeams.length < 2) return [];

  const shuffled = shuffleArray(cleanTeams);
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

/**
 * Formats generated teams into ready-to-send WhatsApp announcement message.
 */
export function formatTeamsForWhatsApp(eventTitle: string, teams: GeneratedTeam[]): string {
  const lines: string[] = [
    `⚽ *HASIL DRAWING PEMBAGIAN TIM*`,
    `Event: *${eventTitle}*`,
    `Waktu Pengacakan: ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`,
    `----------------------------------------`,
  ];

  teams.forEach((t) => {
    lines.push(`\n👕 *${t.name.toUpperCase()}* (${t.players.length} Pemain)`);
    t.players.forEach((p, idx) => {
      const pos = p.position ? ` [${p.position}]` : '';
      const no = p.backNumber ? ` #${p.backNumber}` : '';
      lines.push(`${idx + 1}. ${p.name}${no}${pos}`);
    });
  });

  lines.push(`\n----------------------------------------`);
  lines.push(`Semua pemain dimohon siap di lapangan 15 menit sebelum kick-off. Junjung tinggi sportivitas! 🏆`);

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
