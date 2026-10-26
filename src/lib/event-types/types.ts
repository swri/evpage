import type { PriceType, QuotaMode } from '../../types/index.ts';
import type { AnnouncementLabels, GeneratedTeam, PlayerParticipant, TeamGenerationOptions } from '../team-generator.ts';

/** Words the UI uses for this kind of event (Indonesian, singular/plural). */
export interface EventTypeLabels {
  /** one person, e.g. "Pemain", "Peserta" */
  participant: string;
  participants: string;
  /** a formed group, e.g. "Tim", "Kelompok" */
  group: string;
  groups: string;
  /** the grouping action shown on buttons, e.g. "Acak Tim", "Bagi Kelompok" */
  groupingAction: string;
}

export interface StrategyContext {
  teamCount: number;
  teamNames?: string[];
  seed?: string;
  /** Event-type rule for who is dealt first (e.g. goalkeepers) */
  spreadFirst?: (p: PlayerParticipant) => boolean;
  constraints: Pick<TeamGenerationOptions, 'separateBy' | 'balanceLevel' | 'maxPerTeam'>;
}

/** Pluggable way to form groups. Must be deterministic for a given seed. */
export interface GroupingStrategy {
  id: string;
  label: string;
  description: string;
  /** Whether the result depends on a seed (shown/stored for audit) */
  usesSeed: boolean;
  build(players: PlayerParticipant[], ctx: StrategyContext): GeneratedTeam[];
}

export interface EventTypeModule {
  id: string;
  label: string;
  description: string;
  /** BUILT_IN_TEMPLATES id applied when the organizer picks this type */
  templateId?: string;
  labels: EventTypeLabels;
  defaults: {
    quota_mode: QuotaMode;
    price_type?: PriceType;
  };
  grouping: {
    enabled: boolean;
    /** GROUPING_STRATEGIES ids offered in the modal, first is the default */
    strategies: string[];
    defaultGroupCount: number;
    spreadFirst?: (p: PlayerParticipant) => boolean;
    /** Human description of spreadFirst, e.g. "Kiper disebar rata" */
    spreadFirstLabel?: string;
    announcement: AnnouncementLabels;
  };
}

/**
 * Per-event overrides stored in events.type_config. Only data (no functions),
 * so it can live in the database.
 */
export interface EventTypeConfig {
  labels?: Partial<EventTypeLabels>;
  grouping?: {
    enabled?: boolean;
    defaultGroupCount?: number;
    strategies?: string[];
  };
  announcement?: Partial<AnnouncementLabels>;
}
