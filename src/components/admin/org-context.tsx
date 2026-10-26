'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentAdminSession, type AdminSession } from '@/lib/auth';
import {
  canManageEventIn,
  getMyInvitations,
  getMyOrganizations,
  resolveActiveOrganization,
  setActiveOrganizationId,
  type AccessContext,
  type MyOrganization,
  type OrgInvitation,
} from '@/lib/orgs';

interface OrgContextValue {
  session: AdminSession | null;
  organizations: MyOrganization[];
  activeOrg: MyOrganization | null;
  invitations: OrgInvitation[];
  isPlatformAdmin: boolean;
  loading: boolean;
  setActiveOrg: (id: string) => void;
  refresh: () => Promise<void>;
  canManageEvent: (event: { organization_id?: string; created_by?: string }) => boolean;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState<AdminSession | null>(() => getCurrentAdminSession());
  const [organizations, setOrganizations] = useState<MyOrganization[]>([]);
  const [activeOrg, setActive] = useState<MyOrganization | null>(null);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [orgs, invites] = await Promise.all([getMyOrganizations(session), getMyInvitations(session)]);
      setOrganizations(orgs);
      setActive(resolveActiveOrganization(orgs));
      setInvitations(invites);
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    // Loading external data on mount; state is set after the await
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const setActiveOrg = useCallback(
    (id: string) => {
      const next = organizations.find((o) => o.id === id) || null;
      setActiveOrganizationId(next?.id ?? null);
      setActive(next);
    },
    [organizations]
  );

  const value = useMemo<OrgContextValue>(() => {
    const isPlatformAdmin = !!session?.user.is_platform_admin;
    const ctx: AccessContext = { session, organizations, isPlatformAdmin };
    return {
      session,
      organizations,
      activeOrg,
      invitations,
      isPlatformAdmin,
      loading,
      setActiveOrg,
      refresh,
      canManageEvent: (event) => canManageEventIn(event, ctx),
    };
  }, [session, organizations, activeOrg, invitations, loading, setActiveOrg, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider> (admin layout)');
  return ctx;
}
