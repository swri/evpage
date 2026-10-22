'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentAdminSession, logoutAdmin } from '@/lib/auth';
import { getOrganizationSettings } from '@/lib/store';
import { OrganizationSettings } from '@/types';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  LayoutDashboard,
  CalendarDays,
  PlusCircle,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Layers,
  ChevronRight,
} from 'lucide-react';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [orgSettings, setOrgSettings] = useState<OrganizationSettings | null>(null);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (isLoginPage) {
      setAuthChecked(true);
      return;
    }

    const session = getCurrentAdminSession();
    if (!session) {
      router.push('/admin/login');
      return;
    }

    setAdminUser(session.user);
    setAuthChecked(true);

    getOrganizationSettings().then(setOrgSettings);
  }, [pathname, isLoginPage, router]);

  // If on login page, render children without sidebar
  if (isLoginPage) {
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

  const handleLogout = async () => {
    await logoutAdmin();
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
      label: 'Pengaturan Organisasi',
      href: '/admin/settings',
      icon: Settings,
      active: pathname === '/admin/settings',
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#fafaf9] dark:bg-[#09090b]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-neutral-200/90 bg-white dark:border-neutral-800 dark:bg-neutral-900 shrink-0">
        {/* Brand / Org Header */}
        <div className="p-4 border-b border-neutral-200/80 dark:border-neutral-800 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white font-bold text-sm dark:bg-white dark:text-neutral-900 shadow-xs">
            <Layers className="h-5 w-5" />
          </div>
          <div className="overflow-hidden">
            <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {orgSettings?.name || 'EvPage Admin'}
            </div>
            <div className="text-[11px] text-neutral-400 truncate">Portal Penyelenggara</div>
          </div>
        </div>

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
            <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
              {orgSettings?.name || 'EvPage Admin'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-neutral-200 bg-white p-4 space-y-2 dark:border-neutral-800 dark:bg-neutral-900 animate-in slide-in-from-top-2">
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
