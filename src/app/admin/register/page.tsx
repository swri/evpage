'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startNavigationProgress } from '@/components/ui/navigation-progress';
import Link from 'next/link';
import { registerAdmin, getCurrentAdminSession } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-context';
import {
  ArrowLeft,
  KeyRound,
  Mail,
  User,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AppLogo } from '@/components/ui/app-logo';

export default function AdminRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // If already logged in, redirect to dashboard
    const session = getCurrentAdminSession();
    if (session) {
      startNavigationProgress();
      router.push('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim()) {
      setErrorMessage('Nama lengkap wajib diisi.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Email wajib diisi.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Kata sandi minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await registerAdmin({
        full_name: fullName,
        organization_name: orgName.trim() || fullName.trim(),
        email,
        password,
      });

      if (res.success) {
        toast({
          type: 'success',
          title: 'Pendaftaran Berhasil!',
          message: `Selamat datang, ${res.session?.user.full_name || 'Admin'}! Akun Anda siap digunakan.`,
        });
        // Stays busy until the next page replaces this one
        startNavigationProgress();
        router.push('/admin');
      } else {
        setErrorMessage(res.error || 'Pendaftaran gagal. Silakan coba lagi.');
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan sistem.';
      setErrorMessage(message);
      setIsLoading(false);
    }
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

      {/* Register Box */}
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <AppLogo size="lg" subtitle="Management Portal" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Registrasi Akun Admin
            </h1>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Daftarkan diri Anda sebagai penyelenggara event. Nama akun akan dicantumkan pada card event di halaman utama.
            </p>
          </div>

          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200 dark:bg-red-950/50 dark:border-red-900 dark:text-red-300 animate-in fade-in slide-in-from-top-2">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="full_name"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
              >
                Nama Lengkap Anda <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  id="full_name"
                  type="text"
                  autoComplete="name"
                  placeholder="Contoh: Budi Santoso"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-9 text-xs"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="org_name"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
              >
                Nama Organisasi / Komunitas / EO
              </label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  id="org_name"
                  type="text"
                  placeholder="Contoh: EO Olahraga Nusantara (Opsional)"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                Nama ini akan muncul sebagai keterangan Penyelenggara di event Anda.
              </p>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
              >
                Email Administrator <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="nama@panitia.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
                >
                  Kata Sandi <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Min. 6 digit"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm_password"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400"
                >
                  Ulangi Sandi <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                  <Input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Ketik ulang"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-9 text-xs"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                isLoading={isLoading}
                className="w-full text-xs font-semibold h-10 shadow-xs"
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                <span>Daftar & Buat Akun Penyelenggara</span>
              </Button>
            </div>
          </form>

          {/* Switch to Login Link */}
          <div className="mt-6 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Sudah memiliki akun administrator?{' '}
              <Link
                href="/admin/login"
                className="font-semibold text-neutral-900 underline underline-offset-4 hover:text-neutral-700 dark:text-neutral-100 dark:hover:text-neutral-300"
              >
                Masuk disini
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-neutral-400">
        &copy; 2026 EvPage Multi-Organizer Platform. Pendaftaran Akun Penyelenggara Resmi.
      </footer>
    </div>
  );
}
