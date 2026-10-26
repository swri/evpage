// Event type registry. The core app only talks to EventTypeModule; anything
// sport-specific (goalkeepers, "pemain", kick-off wording) lives in a module.
// Adding a new kind of event = add a module here (or call registerEventType),
// optionally with a form template in BUILT_IN_TEMPLATES. No core changes.
import type { EventItem } from '../../types/index.ts';
import { isSoccerGoalkeeper, SOCCER_ANNOUNCEMENT_LABELS } from '../team-generator.ts';
import type { EventTypeConfig, EventTypeModule } from './types.ts';

export type { EventTypeConfig, EventTypeLabels, EventTypeModule, GroupingStrategy, StrategyContext } from './types.ts';
export { GROUPING_STRATEGIES, getGroupingStrategy, registerGroupingStrategy } from './strategies.ts';

export const generalEventType: EventTypeModule = {
  id: 'general',
  label: 'Event Umum',
  description: 'Pendaftaran tanpa asumsi olahraga; pembagian kelompok opsional.',
  labels: {
    participant: 'Peserta',
    participants: 'Peserta',
    group: 'Kelompok',
    groups: 'Kelompok',
    groupingAction: 'Bagi Kelompok',
  },
  defaults: { quota_mode: 'registration' },
  grouping: {
    enabled: true,
    strategies: ['balanced', 'random', 'seeded', 'manual'],
    defaultGroupCount: 2,
    announcement: {
      heading: '📋 *PEMBAGIAN KELOMPOK*',
      memberLabel: 'Peserta',
      closingNote: 'Mohon hadir tepat waktu dan bergabung dengan kelompok masing-masing.',
    },
  },
};

export const miniSoccerEventType: EventTypeModule = {
  id: 'mini-soccer',
  label: 'Mini Soccer / Futsal',
  description: 'Turnamen beregu: daftar pemain per tim, kiper disebar saat acak tim, undian bagan.',
  templateId: 'mini-soccer',
  labels: {
    participant: 'Pemain',
    participants: 'Pemain',
    group: 'Tim',
    groups: 'Tim',
    groupingAction: 'Acak Tim',
  },
  defaults: { quota_mode: 'registration', price_type: 'fixed' },
  grouping: {
    enabled: true,
    strategies: ['balanced', 'seeded', 'random', 'manual'],
    defaultGroupCount: 2,
    spreadFirst: isSoccerGoalkeeper,
    spreadFirstLabel: 'Kiper terbagi rata',
    announcement: SOCCER_ANNOUNCEMENT_LABELS,
  },
};

export const seminarEventType: EventTypeModule = {
  id: 'seminar',
  label: 'Seminar / Workshop',
  description: 'Peserta individu; kelompok diskusi opsional.',
  templateId: 'seminar-workshop',
  labels: {
    participant: 'Peserta',
    participants: 'Peserta',
    group: 'Kelompok Diskusi',
    groups: 'Kelompok Diskusi',
    groupingAction: 'Bagi Kelompok Diskusi',
  },
  defaults: { quota_mode: 'participant' },
  grouping: {
    enabled: true,
    strategies: ['random', 'balanced', 'manual'],
    defaultGroupCount: 4,
    announcement: {
      heading: '🧑‍🏫 *PEMBAGIAN KELOMPOK DISKUSI*',
      memberLabel: 'Peserta',
      closingNote: 'Silakan menuju meja kelompok masing-masing sebelum sesi dimulai.',
    },
  },
};

export const competitionEventType: EventTypeModule = {
  id: 'competition',
  label: 'Lomba Individu',
  description: 'Kompetisi perorangan; biasanya tanpa pembagian tim.',
  templateId: 'individual-competition',
  labels: {
    participant: 'Peserta',
    participants: 'Peserta',
    group: 'Sesi',
    groups: 'Sesi',
    groupingAction: 'Bagi Sesi',
  },
  defaults: { quota_mode: 'participant' },
  grouping: {
    enabled: false,
    strategies: ['random', 'manual'],
    defaultGroupCount: 2,
    announcement: {
      heading: '🏁 *PEMBAGIAN SESI LOMBA*',
      memberLabel: 'Peserta',
      closingNote: 'Harap hadir 30 menit sebelum sesi Anda dimulai.',
    },
  },
};

export const communityEventType: EventTypeModule = {
  id: 'community',
  label: 'Gathering / Fun Run',
  description: 'Acara komunitas; kuota per orang, kelompok opsional (mis. wave start).',
  templateId: 'community-gathering',
  labels: {
    participant: 'Peserta',
    participants: 'Peserta',
    group: 'Grup',
    groups: 'Grup',
    groupingAction: 'Bagi Grup',
  },
  defaults: { quota_mode: 'participant' },
  grouping: {
    enabled: true,
    strategies: ['random', 'balanced', 'manual'],
    defaultGroupCount: 3,
    announcement: {
      heading: '🎉 *PEMBAGIAN GRUP*',
      memberLabel: 'Peserta',
      closingNote: 'Sampai jumpa di lokasi! Ikuti arahan panitia grup masing-masing.',
    },
  },
};

const REGISTRY = new Map<string, EventTypeModule>(
  [generalEventType, miniSoccerEventType, seminarEventType, competitionEventType, communityEventType].map((m) => [m.id, m])
);

export function registerEventType(module: EventTypeModule): void {
  REGISTRY.set(module.id, module);
}

export function listEventTypes(): EventTypeModule[] {
  return [...REGISTRY.values()];
}

export function getEventType(id: string | undefined | null): EventTypeModule {
  return (id && REGISTRY.get(id)) || generalEventType;
}

/**
 * The module for an event with its per-event overrides (events.type_config)
 * applied. Overrides are data only; behaviour (spreadFirst) stays in code.
 */
export function resolveEventType(event: Pick<EventItem, 'event_type' | 'type_config'> | null | undefined): EventTypeModule {
  const base = getEventType(event?.event_type);
  const config = (event?.type_config || {}) as EventTypeConfig;
  return {
    ...base,
    labels: { ...base.labels, ...config.labels },
    grouping: {
      ...base.grouping,
      enabled: config.grouping?.enabled ?? base.grouping.enabled,
      defaultGroupCount: config.grouping?.defaultGroupCount ?? base.grouping.defaultGroupCount,
      strategies: config.grouping?.strategies?.length ? config.grouping.strategies : base.grouping.strategies,
      announcement: { ...base.grouping.announcement, ...config.announcement },
    },
  };
}
