'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Eye, History, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast-context';
import { useOrg } from '@/components/admin/org-context';
import {
  getDrawChangeRequests,
  getEventDraw,
  participantsHash,
  publishDraw,
  requestDrawChange,
  voteDrawChange,
  type ChangeStatus,
  type DrawChangeRequest,
  type GroupDraw,
  type PublishedTeam,
} from '@/lib/draws';
import { getOrganizationMembers, requiredApprovals, type OrgMember } from '@/lib/orgs';
import { TEAM_ALGORITHM_VERSION, type GeneratedTeam, type PlayerParticipant } from '@/lib/team-generator';
import type { EventItem } from '@/types';

const STATUS_LABEL: Record<ChangeStatus, string> = {
  pending: 'Menunggu persetujuan',
  applied: 'Diterapkan',
  rejected: 'Ditolak',
  stale: 'Kedaluwarsa',
};

/** Team membership only: used to tell whether the working copy differs */
const fingerprint = (teams: { id: string; players: { id: string }[] }[]) =>
  JSON.stringify(teams.map((t) => [t.id, t.players.map((p) => p.id).sort()]));

interface Props {
  event: Pick<EventItem, 'id' | 'organization_id'>;
  workingTeams: GeneratedTeam[];
  seed: string;
  options: Record<string, unknown>;
  manuallyAdjusted: boolean;
  pool: PlayerParticipant[];
  /** Shows a published or proposed result in the team grid */
  onShowTeams: (teams: PublishedTeam[], label: string) => void;
}

export function DrawGovernancePanel({ event, workingTeams, seed, options, manuallyAdjusted, pool, onShowTeams }: Props) {
  const { toast } = useToast();
  const { session } = useOrg();
  const [draw, setDraw] = useState<GroupDraw | null>(null);
  const [requests, setRequests] = useState<DrawChangeRequest[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const current = await getEventDraw(event.id);
      setDraw(current);
      setRequests(current ? await getDrawChangeRequests(current.id) : []);
      if (event.organization_id) setMembers(await getOrganizationMembers(event.organization_id));
      return current;
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memuat hasil undian' });
      return null;
    }
  }, [event.id, event.organization_id, toast]);

  useEffect(() => {
    // Show the official result first when one exists (state is set after the await)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload().then((current) => {
      if (current) onShowTeams(current.result, `Hasil resmi v${current.version}`);
      setLoaded(true);
    });
    // onShowTeams is intentionally not a dependency: only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const needed = requiredApprovals(members.length);
  const nameOf = (userId?: string | null) => {
    const m = members.find((x) => x.user_id === userId);
    return m?.full_name || m?.email || 'Panitia';
  };
  const differsFromPublished = useMemo(
    () => !!draw && workingTeams.length > 0 && fingerprint(workingTeams) !== fingerprint(draw.result),
    [draw, workingTeams]
  );

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      toast({ type: 'success', message: await action() });
      const current = await reload();
      if (current) onShowTeams(current.result, `Hasil resmi v${current.version}`);
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Terjadi kesalahan' });
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = () =>
    run(async () => {
      await publishDraw(
        event,
        workingTeams,
        {
          algorithm: TEAM_ALGORITHM_VERSION,
          seed: manuallyAdjusted ? undefined : seed,
          options: { ...options, manuallyAdjusted },
          participantsHash: await participantsHash(pool),
        },
        session
      );
      return 'Hasil undian dipublikasikan. Perubahan berikutnya memerlukan persetujuan panitia.';
    });

  const handleRequest = () =>
    run(async () => {
      if (!draw) return '';
      const { outcome, request } = await requestDrawChange(
        draw,
        workingTeams,
        { reason, seed: manuallyAdjusted ? undefined : seed, options: { ...options, manuallyAdjusted } },
        session
      );
      setReason('');
      if (outcome === 'applied') return 'Perubahan langsung diterapkan.';
      return `Perubahan diajukan. Perlu ${request.required_approvals} persetujuan (termasuk Anda).`;
    });

  const handleVote = (requestId: string, approve: boolean) =>
    run(async () => {
      const outcome = await voteDrawChange(requestId, approve, session);
      return outcome === 'applied'
        ? 'Persetujuan terpenuhi, perubahan diterapkan.'
        : outcome === 'rejected'
          ? 'Permintaan ditolak.'
          : outcome === 'stale'
            ? 'Hasil undian sudah berubah; permintaan ini kedaluwarsa.'
            : 'Suara dicatat.';
    });

  if (!loaded) return null;

  return (
    <section
      aria-label="Publikasi & persetujuan hasil undian"
      className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-900/60 space-y-3"
    >
      {!draw ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-neutral-600 dark:text-neutral-400">
            Belum dipublikasikan. Setelah dipublikasikan, perubahan memerlukan {needed} persetujuan
            {needed > 1 ? ` dari ${members.length} panitia` : ' (Anda satu-satunya panitia)'}.
          </span>
          <Button size="sm" disabled={busy || workingTeams.length === 0} onClick={handlePublish} className="gap-1.5">
            <BadgeCheck className="h-3.5 w-3.5" />
            Publikasikan Hasil
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-neutral-700 dark:text-neutral-300">
              <strong>Hasil resmi v{draw.version}</strong>
              {draw.seed ? <> · seed <span className="font-mono">{draw.seed}</span></> : ' · disusun manual'} · perubahan
              perlu {needed} persetujuan
            </span>
            <Button size="sm" variant="outline" onClick={() => onShowTeams(draw.result, `Hasil resmi v${draw.version}`)} className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Tampilkan hasil resmi
            </Button>
          </div>

          {differsFromPublished && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan perubahan (mis. pemain cedera)"
                aria-label="Alasan perubahan"
                className="h-8 flex-1 rounded-lg border border-neutral-200 bg-white px-2 dark:border-neutral-800 dark:bg-neutral-800"
              />
              <Button size="sm" disabled={busy} onClick={handleRequest} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                {needed > 1 ? 'Ajukan Perubahan' : 'Terapkan Perubahan'}
              </Button>
            </div>
          )}

          {requests.length > 0 && (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {requests.map((r) => {
                const yes = r.votes.filter((v) => v.approve).length;
                const myVote = r.votes.find((v) => v.user_id === session?.user.id);
                return (
                  <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {nameOf(r.requested_by)} · v{r.base_version} → v{r.base_version + 1}
                        {r.reason && <span className="font-normal text-neutral-500"> · {r.reason}</span>}
                      </div>
                      <div className="text-neutral-500">
                        {yes}/{r.required_approvals} setuju ·{' '}
                        <Badge variant={r.status === 'applied' ? 'success' : r.status === 'pending' ? 'warning' : 'secondary'}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Lihat usulan"
                        onClick={() => onShowTeams(r.proposed_result, `Usulan dari ${nameOf(r.requested_by)}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {r.status === 'pending' && !myVote && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => handleVote(r.id, true)} className="gap-1">
                            <Check className="h-3.5 w-3.5" /> Setujui
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleVote(r.id, false)} className="gap-1 text-red-600">
                            <X className="h-3.5 w-3.5" /> Tolak
                          </Button>
                        </>
                      )}
                      {r.status === 'pending' && myVote && (
                        <span className="text-neutral-500">Anda {myVote.approve ? 'menyetujui' : 'menolak'}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
