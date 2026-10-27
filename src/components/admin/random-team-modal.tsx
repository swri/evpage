'use client';

import React, { useState, useMemo } from 'react';
import {
  Shuffle,
  Users,
  Trophy,
  Check,
  Download,
  ArrowRightLeft,
  X,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import {
  PlayerParticipant,
  GeneratedTeam,
  TournamentMatchup,
  extractPlayersFromRegistrations,
  generateTournamentDraw,
  formatTeamsForWhatsApp,
  formatTournamentForWhatsApp,
  generateSeed,
  bySameOrigin,
  countSeparationConflicts,
  teamLevel,
} from '@/lib/team-generator';
import { sanitizeCsvCell } from '@/lib/export';
import { EventItem, Registration } from '@/types';
import { DrawGovernancePanel } from '@/components/admin/draw-governance-panel';
import { getGroupingStrategy, resolveEventType } from '@/lib/event-types';

interface RandomTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  registrations: Registration[];
  /** Needed to publish the draw and manage change approvals */
  event?: EventItem | null;
}

export function RandomTeamModal({
  open,
  onOpenChange,
  eventTitle,
  registrations,
  event,
}: RandomTeamModalProps) {
  const { toast } = useToast();

  // Terms, strategies and priority rule come from the event type module
  const eventType = useMemo(() => resolveEventType(event), [event]);
  const L = eventType.labels;
  const strategies = eventType.grouping.strategies.map(getGroupingStrategy);

  const [activeTab, setActiveTab] = useState<'players' | 'tournament'>('players');
  const [teamCount, setTeamCount] = useState<number>(() => eventType.grouping.defaultGroupCount);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(true);
  const [strategyId, setStrategyId] = useState<string>(() => eventType.grouping.strategies[0]);
  const strategy = getGroupingStrategy(strategyId);

  // Colour names suit sport teams; other events get "Kelompok 1, 2, ..."
  const teamNames = useMemo(
    () =>
      eventType.grouping.spreadFirst
        ? undefined
        : Array.from({ length: 12 }, (_, i) => `${L.group} ${i + 1}`),
    [eventType, L.group]
  );

  // Selected player pool
  const candidateRegistrations = useMemo(() => {
    if (onlyVerified) {
      return registrations.filter((r) => r.status === 'verified');
    }
    return registrations.filter((r) => r.status !== 'rejected');
  }, [registrations, onlyVerified]);

  const allPlayers = useMemo(() => {
    return extractPlayersFromRegistrations(candidateRegistrations);
  }, [candidateRegistrations]);

  // Generated state
  const [generatedTeams, setGeneratedTeams] = useState<GeneratedTeam[]>([]);
  // Bumped on every new draw so the result cards replay their entrance
  const [drawRound, setDrawRound] = useState(0);
  const [generatedMatchups, setGeneratedMatchups] = useState<TournamentMatchup[]>([]);
  const [copiedWA, setCopiedWA] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  // Seed makes a draw replayable: same seed + same participants = same teams
  const [seedInput, setSeedInput] = useState('');
  const [usedSeed, setUsedSeed] = useState('');
  const [manuallyAdjusted, setManuallyAdjusted] = useState(false);

  // Fairness constraints
  const [separateClubs, setSeparateClubs] = useState(false);
  const [balanceLevel, setBalanceLevel] = useState(false);
  const [maxPerTeam, setMaxPerTeam] = useState<string>('');
  const hasLevels = useMemo(() => allPlayers.some((p) => p.level !== undefined), [allPlayers]);
  const separationConflicts = useMemo(
    () => (separateClubs ? countSeparationConflicts(generatedTeams, bySameOrigin) : 0),
    [separateClubs, generatedTeams]
  );

  // Manual player move target
  const [selectedPlayer, setSelectedPlayer] = useState<{
    teamId: string;
    player: PlayerParticipant;
  } | null>(null);

  // Run initial shuffle when players change or when opening
  const handleShuffleTeams = () => {
    if (allPlayers.length === 0) {
      toast({
        type: 'error',
        title: `Tidak Ada ${L.participants}`,
        message: 'Belum ada data pemain dari pendaftar yang memenuhi kriteria.',
      });
      return;
    }

    setIsShuffling(true);
    setTimeout(() => {
      try {
        const seed = strategy.usesSeed ? seedInput.trim().toUpperCase() || generateSeed() : '';
        const teams = strategy.build(allPlayers, {
          teamCount,
          teamNames,
          seed: seed || undefined,
          spreadFirst: eventType.grouping.spreadFirst,
          constraints: {
            separateBy: separateClubs ? bySameOrigin : undefined,
            balanceLevel: balanceLevel && hasLevels,
            maxPerTeam: maxPerTeam ? Number(maxPerTeam) : undefined,
          },
        });
        setGeneratedTeams(teams);
        setDrawRound((n) => n + 1);
        setUsedSeed(seed);
        setSeedInput('');
        setManuallyAdjusted(false);
        setSelectedPlayer(null);
        toast({
          type: 'success',
          title: `${L.groups} Terbentuk`,
          message: `${allPlayers.length} ${L.participants.toLowerCase()} dibagi ke ${teams.length} ${L.groups.toLowerCase()} (${strategy.label})${seed ? `. Seed: ${seed}` : ''}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal mengacak tim';
        toast({ type: 'error', message: msg });
      } finally {
        setIsShuffling(false);
      }
    }, 250);
  };

  // Run tournament draw
  const handleTournamentDraw = () => {
    // Extract unique team names or participant names
    const teamsToDraw: string[] = [];
    candidateRegistrations.forEach((reg) => {
      const answers = reg.answers || {};
      const teamName =
        (answers.team_name as string) ||
        (answers.nama_tim as string) ||
        reg.contact_name;
      if (teamName && !teamsToDraw.includes(teamName)) {
        teamsToDraw.push(teamName);
      }
    });

    if (teamsToDraw.length < 2) {
      toast({
        type: 'error',
        title: 'Peserta Kurang',
        message: 'Minimal dibutuhkan 2 tim pendaftar untuk melakukan undian bagan turnamen.',
      });
      return;
    }

    setIsShuffling(true);
    setTimeout(() => {
      const matchups = generateTournamentDraw(teamsToDraw);
      setGeneratedMatchups(matchups);
      setDrawRound((n) => n + 1);
      setIsShuffling(false);
      toast({
        type: 'success',
        title: 'Undian Bagan Selesai!',
        message: `${matchups.length} pertandingan berhasil diundi.`,
      });
    }, 250);
  };

  // Move selected player to another team
  const handleMovePlayer = (targetTeamId: string) => {
    if (!selectedPlayer || selectedPlayer.teamId === targetTeamId) {
      setSelectedPlayer(null);
      return;
    }

    const nextTeams = generatedTeams.map((team) => {
      if (team.id === selectedPlayer.teamId) {
        return {
          ...team,
          players: team.players.filter((p) => p.id !== selectedPlayer.player.id),
        };
      }
      if (team.id === targetTeamId) {
        return {
          ...team,
          players: [...team.players, selectedPlayer.player],
        };
      }
      return team;
    });

    setGeneratedTeams(nextTeams);
    setManuallyAdjusted(true);
    setSelectedPlayer(null);
    toast({
      type: 'info',
      message: `${selectedPlayer.player.name} dipindahkan ke ${nextTeams.find((t) => t.id === targetTeamId)?.name}.`,
    });
  };

  // Copy WhatsApp Formatted Message
  const handleCopyWhatsApp = () => {
    let text = '';
    if (activeTab === 'players') {
      if (generatedTeams.length === 0) {
        toast({ type: 'info', message: 'Silakan acak tim terlebih dahulu.' });
        return;
      }
      // A seed only proves the draw if nobody moved players afterwards
      text = formatTeamsForWhatsApp(eventTitle, generatedTeams, {
        seed: manuallyAdjusted || !usedSeed ? undefined : usedSeed,
        labels: eventType.grouping.announcement,
      });
    } else {
      if (generatedMatchups.length === 0) {
        toast({ type: 'info', message: 'Silakan lakukan undian bagan terlebih dahulu.' });
        return;
      }
      text = formatTournamentForWhatsApp(eventTitle, generatedMatchups);
    }

    navigator.clipboard.writeText(text);
    setCopiedWA(true);
    setTimeout(() => setCopiedWA(false), 2000);
    toast({
      type: 'success',
      title: 'Tersalin ke Clipboard!',
      message: 'Format teks pengumuman siap dikirim ke WhatsApp.',
    });
  };

  // Export CSV of teams
  const handleExportCSV = () => {
    if (generatedTeams.length === 0) {
      toast({ type: 'info', message: 'Silakan acak tim terlebih dahulu.' });
      return;
    }

    // Quote-escape and neutralise formulas: names come from participants
    const cell = (value: unknown) => `"${String(sanitizeCsvCell(value ?? '-')).replace(/"/g, '""')}"`;
    const rows: string[] = ['Tim,Nama Pemain,Posisi,No Punggung,Asal Klub,Kontak'];
    generatedTeams.forEach((team) => {
      team.players.forEach((p) => {
        rows.push(
          [team.name, p.name, p.position || '-', p.backNumber ?? '-', p.teamOrigin || '-', p.contactPhone || '-']
            .map(cell)
            .join(',')
        );
      });
    });
    if (usedSeed) rows.push('', cell(`Seed: ${usedSeed}${manuallyAdjusted ? ' (diubah manual)' : ''}`));

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `hasil-tim-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Main Container */}
      <div className="relative z-50 w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 transition-all overflow-hidden animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-50/60 dark:bg-neutral-900/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 flex items-center justify-center shadow-xs">
              <Shuffle className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <span>{L.groupingAction} & Undian Bagan</span>
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                  {eventType.label}
                </Badge>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {eventTitle} &bull; Total Pool: <strong>{allPlayers.length} {L.participants}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Controls & Filter Bar */}
        <div className="p-3 sm:px-5 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('players')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'players'
                  ? 'bg-white shadow-2xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{L.groupingAction}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tournament')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'tournament'
                  ? 'bg-white shadow-2xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>Undian Bagan Turnamen (Match)</span>
            </button>
          </div>

          {/* Configuration controls */}
          {activeTab === 'players' && (
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <span>Bagi Menjadi:</span>
                <select
                  value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  className="h-8 rounded-lg border border-neutral-200 bg-white px-2 font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n} {L.groups}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title={strategy.description}>
                <span>Metode:</span>
                <select
                  value={strategy.id}
                  onChange={(e) => setStrategyId(e.target.value)}
                  className="h-8 rounded-lg border border-neutral-200 bg-white px-2 font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyVerified}
                  onChange={(e) => setOnlyVerified(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900"
                />
                <span>Hanya Verified ({candidateRegistrations.length})</span>
              </label>

              <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={separateClubs}
                  onChange={(e) => setSeparateClubs(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900"
                />
                <span>Pisahkan asal tim/klub yang sama</span>
              </label>

              <label
                className={`flex items-center gap-1.5 cursor-pointer ${hasLevels ? 'text-neutral-600 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-600'}`}
                title={hasLevels ? undefined : 'Tambahkan sub-field "level" (angka) di formulir untuk memakai opsi ini'}
              >
                <input
                  type="checkbox"
                  checked={balanceLevel && hasLevels}
                  disabled={!hasLevels}
                  onChange={(e) => setBalanceLevel(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900"
                />
                <span>Seimbangkan level</span>
              </label>

              <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <span>Maks/tim</span>
                <input
                  type="number"
                  min={1}
                  value={maxPerTeam}
                  onChange={(e) => setMaxPerTeam(e.target.value)}
                  placeholder="-"
                  aria-label="Maksimal anggota per tim"
                  className="h-8 w-14 rounded-lg border border-neutral-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-800"
                />
              </label>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'players' ? (
            <div>
              {/* Action Button Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleShuffleTeams}
                    disabled={isShuffling || allPlayers.length === 0}
                    className="h-9 text-xs font-semibold gap-1.5 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 shadow-xs"
                  >
                    <Shuffle className={`h-3.5 w-3.5 ${isShuffling ? 'animate-spin' : ''}`} />
                    <span>{generatedTeams.length === 0 ? `${L.groupingAction} Sekarang` : `Ulangi ${L.groupingAction}`}</span>
                  </Button>

                  <input
                    type="text"
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    placeholder="Seed (opsional)"
                    aria-label="Seed pengacakan untuk mengulang hasil"
                    className="h-9 w-32 rounded-lg border border-neutral-200 bg-white px-2 font-mono text-xs uppercase text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
                  />

                  {usedSeed && (
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Seed: <strong className="font-mono text-neutral-800 dark:text-neutral-200">{usedSeed}</strong>
                      {manuallyAdjusted && ' (diubah manual)'}
                      {separateClubs && generatedTeams.length > 0 && (
                        <> &bull; {separationConflicts === 0 ? 'semua klub terpisah' : `${separationConflicts} pasangan satu klub tak terhindarkan`}</>
                      )}
                    </span>
                  )}

                  {generatedTeams.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportCSV}
                      className="h-9 text-xs gap-1.5 border-neutral-200 dark:border-neutral-800"
                    >
                      <Download className="h-3.5 w-3.5 text-neutral-500" />
                      <span>Unduh CSV</span>
                    </Button>
                  )}
                </div>

                {generatedTeams.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyWhatsApp}
                    className="h-9 text-xs gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800"
                  >
                    {copiedWA ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                    <span>{copiedWA ? 'Tersalin!' : 'Salin Format WhatsApp'}</span>
                  </Button>
                )}
              </div>

              {event?.organization_id && (
                <DrawGovernancePanel
                  event={event}
                  workingTeams={generatedTeams}
                  seed={usedSeed}
                  options={{
                    strategy: strategy.id,
                    eventType: eventType.id,
                    teamCount,
                    onlyVerified,
                    separateClubs,
                    balanceLevel: balanceLevel && hasLevels,
                    maxPerTeam: maxPerTeam ? Number(maxPerTeam) : null,
                  }}
                  manuallyAdjusted={manuallyAdjusted}
                  pool={allPlayers}
                  onShowTeams={(teams, label) => {
                    setGeneratedTeams(teams);
                    setManuallyAdjusted(false);
                    setSelectedPlayer(null);
                    toast({ type: 'info', message: `Menampilkan: ${label}` });
                  }}
                />
              )}

              {/* Player Swap Indicator banner */}
              {selectedPlayer && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      Memindahkan <strong>{selectedPlayer.player.name}</strong>. Klik tombol <strong>&ldquo;Pindah Disini&rdquo;</strong> pada tim tujuan.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPlayer(null)}
                    className="underline hover:text-amber-900 font-semibold text-[11px]"
                  >
                    Batal
                  </button>
                </div>
              )}

              {/* Teams Display Grid */}
              {generatedTeams.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 mt-4">
                  <Users className="h-10 w-10 text-neutral-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    Belum Ada Tim yang Dibagi
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1">
                    Klik tombol <strong>&ldquo;{L.groupingAction} Sekarang&rdquo;</strong> di atas untuk membagikan {allPlayers.length}{' '}
                    {L.participants.toLowerCase()} ke {teamCount} {L.groups.toLowerCase()} ({strategy.description}
                    {eventType.grouping.spreadFirstLabel && strategy.id !== 'random' && strategy.id !== 'manual' ? ` ${eventType.grouping.spreadFirstLabel}.` : ''}).
                  </p>
                </div>
              ) : (
                <div
                  key={drawRound}
                  className={`grid gap-4 mt-4 grid-cols-1 md:grid-cols-2 transition-opacity duration-200 ${generatedTeams.length >= 3 ? 'lg:grid-cols-3' : ''} ${
                    isShuffling ? 'opacity-40' : ''
                  }`}
                >
                  {generatedTeams.map((team, i) => {
                    const isSourceTeam = selectedPlayer?.teamId === team.id;
                    const spread = eventType.grouping.spreadFirst;
                    const gks = spread ? team.players.filter(spread) : [];

                    return (
                      <div
                        key={team.id}
                        className="rounded-xl border border-neutral-200/90 bg-white dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden shadow-xs flex flex-col animate-in fade-in zoom-in-95"
                        style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      >
                        {/* Team Header */}
                        <div
                          className="px-4 py-3 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800"
                          style={{ borderTop: `4px solid ${team.color}` }}
                        >
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
                              {team.name}
                            </h4>
                            <span className="text-[11px] text-neutral-400">
                              {team.players.length} {L.participants}
                              {eventType.grouping.spreadFirst && <> &bull; {gks.length} Kiper (GK)</>}
                              {balanceLevel && hasLevels && <> &bull; Level {teamLevel(team)}</>}
                            </span>
                          </div>

                          {selectedPlayer && !isSourceTeam && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMovePlayer(team.id)}
                              className="h-7 text-[10px] px-2 bg-amber-500 hover:bg-amber-600 text-white border-none shadow-xs font-semibold"
                            >
                              Pindah Disini
                            </Button>
                          )}
                        </div>

                        {/* Player List */}
                        <div className="p-3 flex-1 divide-y divide-neutral-100 dark:divide-neutral-800/60 max-h-72 overflow-y-auto">
                          {team.players.map((p, idx) => {
                            const isGK = p.position === 'GK' || (p.position || '').includes('KIPER');
                            const isSelected = selectedPlayer?.player.id === p.id;

                            return (
                              <div
                                key={p.id}
                                className={`py-1.5 px-2 flex items-center justify-between text-xs rounded-md transition-colors ${
                                  isSelected
                                    ? 'bg-amber-100 dark:bg-amber-950/60'
                                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-[11px] text-neutral-400 w-4 text-right">
                                    {idx + 1}.
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate flex items-center gap-1.5">
                                      <span>{p.name}</span>
                                      {p.backNumber && (
                                        <span className="text-[10px] text-neutral-400">
                                          #{p.backNumber}
                                        </span>
                                      )}
                                    </div>
                                    {p.teamOrigin && (
                                      <div className="text-[10px] text-neutral-400 truncate">
                                        {p.teamOrigin}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  {p.position && (
                                    <Badge
                                      variant={isGK ? 'default' : 'secondary'}
                                      className={`text-[9px] px-1 py-0 ${
                                        isGK
                                          ? 'bg-amber-500 hover:bg-amber-600 text-white font-bold'
                                          : ''
                                      }`}
                                    >
                                      {p.position}
                                    </Badge>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedPlayer(
                                        isSelected ? null : { teamId: team.id, player: p }
                                      )
                                    }
                                    title="Pindahkan pemain ke tim lain"
                                    className="p-1 text-neutral-300 hover:text-neutral-700 dark:hover:text-neutral-200"
                                  >
                                    <ArrowRightLeft className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Tournament Matchmaking Draw */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-4 border-b border-neutral-100 dark:border-neutral-800">
                <Button
                  onClick={handleTournamentDraw}
                  disabled={isShuffling || candidateRegistrations.length < 2}
                  className="h-9 text-xs font-semibold gap-1.5 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 shadow-xs"
                >
                  <Trophy className={`h-3.5 w-3.5 ${isShuffling ? 'animate-spin' : ''}`} />
                  <span>
                    {generatedMatchups.length === 0
                      ? 'Undi Lawan Pertandingan Sekarang'
                      : 'Undi Ulang Bagan (Re-Draw)'}
                  </span>
                </Button>

                {generatedMatchups.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyWhatsApp}
                    className="h-9 text-xs gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800"
                  >
                    {copiedWA ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                    <span>{copiedWA ? 'Tersalin!' : 'Salin Jadwal ke WhatsApp'}</span>
                  </Button>
                )}
              </div>

              {generatedMatchups.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 mt-4">
                  <Trophy className="h-10 w-10 text-neutral-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    Bagan Pertandingan Belum Diundi
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto mt-1">
                    Fitur ini mengundi tim-tim yang mendaftar secara adil ke dalam pasangan pertandingan eliminasi / gugur.
                  </p>
                </div>
              ) : (
                <div
                  key={drawRound}
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 transition-opacity duration-200 ${isShuffling ? 'opacity-40' : ''}`}
                >
                  {generatedMatchups.map((m, i) => (
                    <div
                      key={m.matchNumber}
                      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between animate-in fade-in zoom-in-95"
                      style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                    >
                      <div className="flex items-center justify-between text-xs text-neutral-400 pb-2 border-b border-neutral-100 dark:border-neutral-800">
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {m.roundName}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          Knockout
                        </Badge>
                      </div>

                      <div className="py-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-neutral-900 dark:text-neutral-100 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                          <span className="truncate">{m.teamA}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">Tim Home</span>
                        </div>
                        <div className="text-center text-[11px] font-black tracking-widest text-neutral-400">
                          VS
                        </div>
                        <div className="flex items-center justify-between text-xs font-bold text-neutral-900 dark:text-neutral-100 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/60">
                          <span className="truncate">{m.teamB}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">Tim Away</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <span>
            {activeTab === 'players'
              ? `Menampilkan ${generatedTeams.reduce((acc, t) => acc + t.players.length, 0)} pemain di ${generatedTeams.length} tim`
              : `${generatedMatchups.length} jadwal pertandingan`}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Selesai / Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
