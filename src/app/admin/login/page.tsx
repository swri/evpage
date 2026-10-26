'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAdmin, getCurrentAdminSession } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-context';
import { ArrowLeft, KeyRound, Mail, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('admin@evpage.com');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // If already logged in, redirect to dashboard
    const session = getCurrentAdminSession();
    if (session) {
      router.push('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await loginAdmin(email, password);
      if (res.success) {
        toast({
          type: 'success',
          title: 'Login Berhasil',
          message: `Selamat datang kembali, ${res.session?.user.full_name || 'Admin'}!`,
        });
        router.push('/admin');
      } else {
        setErrorMessage(res.error || 'Login gagal. Periksa kembali email dan password.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    setEmail('admin@evpage.com');
    setPassword('admin123');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#fafaf9] dark:bg-[#09090b]">
      {/* Header */}
      <header className="p-4 sm:p-6 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Ke Beranda Publik</span>
        </Link>
        <ThemeToggle />
      </header>

      {/* Login Box */}
      <div className="mx-auto w-full max-w-md px-4 py-8">
        <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <AppLogo size="lg" subtitle="Management Portal" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Masuk Portal Admin
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Kelola event, buat formulir kustom, verifikasi pendaftar & laporan keuangan.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
              >
                Email Administrator
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@evpage.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
              >
                Kata Sandi
              </label>
              <div className="relative mt-1">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 text-xs"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              isLoading={isLoading}
              className="w-full text-xs font-semibold h-10 shadow-xs"
            >
              Masuk ke Dashboard
            </Button>
          </form>

          {/* Link to Register New Admin */}
          <div className="mt-5 text-center">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Belum punya akun admin?{' '}
              <Link
                href="/admin/register"
                className="font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-700 dark:text-neutral-100 dark:hover:text-neutral-300"
              >
                Daftar Akun Baru
              </Link>
            </p>
          </div>

          {/* Quick Demo Login Pill */}
          <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="w-full flex items-center justify-between rounded-lg border border-dashed border-neutral-300 p-2.5 text-xs text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/40 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Isi Kredensial Demo Instan
              </span>
              <span className="text-[11px] text-neutral-400">admin@evpage.com</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-neutral-400">
        &copy; 2026 EvPage Security Layer. Akses khusus penyelenggara resmi.
      </footer>
    </div>
  );
}
