'use client';

import React, { useState, useEffect } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentAdminSession, logoutAdmin, setupAuthListener } from '@/lib/auth';
import { OrgProvider, useOrg } from '@/components/admin/org-context';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';
import { startNavigationProgress } from '@/components/ui/navigation-progress';
import { usePresence } from '@/components/ui/use-presence';
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

/** Small spinner at the end of a nav link while its page is loading. */
function NavPendingHint() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-neutral-400 btn-busy-spinner" />;
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [authChecked, setAuthChecked] = useState(false);

  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/register';

  useEffect(() => {
    if (isAuthPage) {
      return;
    }

    const session = getCurrentAdminSession();
    if (!session) {
      startNavigationProgress();
      router.push('/admin/login');
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setAuthChecked(true);
    });

    const unsubscribe = setupAuthListener(() => {
      startNavigationProgress();
      router.push('/admin/login');
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pathname, isAuthPage, router]);

  // If on auth pages (login / register), render children without sidebar
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Waiting for session verification
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
      </div>
    );
  }

  return (
    <OrgProvider>
      <AdminShell>{children}</AdminShell>
    </OrgProvider>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, organizations, activeOrg, setActiveOrg, invitations, isPlatformAdmin } = useOrg();
  const adminUser = session?.user ?? null;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenu = usePresence(isMobileMenuOpen);

  const handleLogout = async () => {
    await logoutAdmin();
    startNavigationProgress();
    router.push('/admin/login');
  };

  const navItems = [
    {
      label: 'Dashboard',
      href: '/admin',
      icon: LayoutDashboard,
      active: pathname === '/admin',
    },
    {
      label: 'Semua Event & Pendaftar',
      href: '/admin/events',
      icon: CalendarDays,
      active: pathname === '/admin/events' || pathname.startsWith('/admin/events/'),
    },
    {
      label: 'Buat Event Baru',
      href: '/admin/events/new',
      icon: PlusCircle,
      active: pathname === '/admin/events/new',
    },
    {
      label: invitations.length > 0 ? `Organisasi & Tim (${invitations.length} undangan)` : 'Organisasi & Tim',
      href: '/admin/organization',
      icon: Building2,
      active: pathname === '/admin/organization',
    },
    {
      label: 'Branding & Rekening',
      href: '/admin/settings',
      icon: Settings,
      active: pathname === '/admin/settings',
    },
    // App owner only: storage usage and deleting unused data
    ...(isPlatformAdmin
      ? [{ label: 'Pemeliharaan Platform', href: '/admin/platform', icon: ShieldCheck, active: pathname === '/admin/platform' }]
      : []),
  ];

  return (
    <div className="min-h-screen flex bg-[#fafaf9] dark:bg-[#09090b] animate-in fade-in">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-neutral-200/90 bg-white dark:border-neutral-800 dark:bg-neutral-900 shrink-0">
        {/* Brand / Org Header with Monochrome EVP Logo */}
        <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center justify-between">
          <Link href="/admin" className="hover:opacity-90 transition-opacity">
            <AppLogo size="sm" subtitle={activeOrg?.name || 'Admin Portal'} />
          </Link>
        </div>

        {/* Organization switcher: everything below is scoped to this tenant */}
        {organizations.length > 1 && (
          <div className="px-4 pt-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1" htmlFor="org-switcher">
              Organisasi Aktif
            </label>
            <select
              id="org-switcher"
              value={activeOrg?.id || ''}
              onChange={(e) => setActiveOrg(e.target.value)}
              className="w-full h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-900 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Links */}
        <div className="flex-1 py-4 px-3 space-y-1">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Menu Utama
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  item.active
                    ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white font-semibold'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${item.active ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'}`} />
                <span>{item.label}</span>
                <NavPendingHint />
              </Link>
            );
          })}

          <div className="pt-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Akses Cepat
          </div>

          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <ExternalLink className="h-4 w-4 text-neutral-400 shrink-0" />
              <span>Halaman Publik</span>
            </span>
            <ChevronRight className="h-3 w-3 text-neutral-300" />
          </Link>
        </div>

        {/* User Info & Logout Footer */}
        <div className="p-3 border-t border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-neutral-200 shrink-0">
                {adminUser?.full_name?.charAt(0) || 'A'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {adminUser?.full_name || 'Admin'}
                </div>
                <div className="text-[11px] text-neutral-400 truncate">
                  {adminUser?.email || 'admin@evpage.com'}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Keluar"
              aria-label="Logout"
              className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex md:hidden items-center justify-between border-b border-neutral-200/80 bg-white/90 backdrop-blur-md px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/90">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              aria-label="Toggle Navigation Menu"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <AppLogo size="sm" subtitle="Admin" />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile Menu Dropdown */}
        {mobileMenu.mounted && (
          <div
            className={`md:hidden border-b border-neutral-200 bg-white p-4 space-y-2 dark:border-neutral-800 dark:bg-neutral-900 ${
              mobileMenu.closing ? 'animate-out fade-out slide-out-to-top-2 pointer-events-none' : 'animate-in fade-in slide-in-from-top-2'
            }`}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium ${
                    item.active
                      ? 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <NavPendingHint />
                </Link>
              );
            })}
            <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar (Logout)</span>
              </button>
            </div>
          </div>
        )}

        {/* Content Area */}
        {/* Sidebar and header stay put; page content transitions via template.tsx */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#fafaf9] dark:bg-[#09090b]">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white" />
        </div>
      }
    >
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </React.Suspense>
  );
}
