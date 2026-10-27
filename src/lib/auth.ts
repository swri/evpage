import { createClient } from './supabase/client.ts';
import { createOrganization } from './orgs.ts';
import { logger } from './logger.ts';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  organization_name?: string;
  /** Legacy demo accounts only; new accounts store passwordHash instead */
  password?: string;
  passwordHash?: string;
  created_at: string;
}

export interface AdminSession {
  user: {
    id: string;
    email: string;
    full_name: string;
    organization_name?: string;
    /** App owner: sees and manages every organization (platform_admins) */
    is_platform_admin?: boolean;
  };
  token: string;
}

const ADMIN_STORAGE_KEY = 'evpage_admin_auth';
const REGISTERED_ADMINS_KEY = 'evpage_registered_admins';

// Demo-only account. It is never accepted when Supabase is configured.
const DEFAULT_DEMO_ADMIN: AdminUser = {
  id: 'admin-demo-uuid-1',
  email: 'admin@evpage.com',
  password: 'admin123',
  full_name: 'Administrator Utama',
  organization_name: 'EvPage Central',
  created_at: '2026-01-01T00:00:00.000Z',
};

/**
 * SHA-256 hex digest. Local accounts are a demo convenience, but the
 * password still should not sit in localStorage as plain text.
 */
export async function hashPassword(email: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`evpage:${email}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function localPasswordMatches(admin: AdminUser, password: string): Promise<boolean> {
  if (admin.passwordHash) {
    return admin.passwordHash === (await hashPassword(admin.email.toLowerCase(), password));
  }
  return admin.password !== undefined && admin.password === password;
}

function randomToken(prefix: string): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2);
  return `${prefix}-${id}`;
}

function persistSession(session: AdminSession) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
  }
}

/**
 * Get all registered administrators (from localStorage, fallback to default demo admin)
 */
export function getRegisteredAdmins(): AdminUser[] {
  if (typeof window === 'undefined') return [DEFAULT_DEMO_ADMIN];
  try {
    const raw = localStorage.getItem(REGISTERED_ADMINS_KEY);
    if (!raw) {
      const initial = [DEFAULT_DEMO_ADMIN];
      localStorage.setItem(REGISTERED_ADMINS_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [DEFAULT_DEMO_ADMIN];
    }
    return parsed;
  } catch {
    return [DEFAULT_DEMO_ADMIN];
  }
}

/**
 * Register a new Administrator account
 */
export async function registerAdmin(params: {
  email: string;
  password: string;
  full_name: string;
  organization_name?: string;
}): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
  const emailClean = params.email.trim().toLowerCase();
  const nameClean = params.full_name.trim();
  const orgClean = (params.organization_name || '').trim();

  if (!nameClean) {
    return { success: false, error: 'Nama lengkap wajib diisi.' };
  }
  if (!emailClean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
    return { success: false, error: 'Format email tidak valid.' };
  }
  if (!params.password || params.password.length < 6) {
    return { success: false, error: 'Kata sandi minimal 6 karakter.' };
  }

  const supabase = createClient();

  if (supabase) {
    // Database mode: Supabase Auth is the only account store
    const { data, error } = await supabase.auth.signUp({
      email: emailClean,
      password: params.password,
      options: {
        data: {
          full_name: nameClean,
          organization_name: orgClean,
        },
      },
    });

    if (error || !data.user) {
      return { success: false, error: error?.message || 'Pendaftaran akun gagal.' };
    }

    // The profile row is created by the on_auth_user_created trigger
    if (!data.session) {
      // Email confirmation is enabled; the organization is created after the
      // first login from the dashboard instead.
      return {
        success: false,
        error: 'Akun berhasil dibuat. Cek email Anda untuk konfirmasi, lalu masuk.',
      };
    }

    const session: AdminSession = {
      user: {
        id: data.user.id,
        email: emailClean,
        full_name: nameClean,
        organization_name: orgClean || nameClean,
      },
      token: data.session.access_token,
    };
    try {
      await createOrganization(orgClean || nameClean, session);
    } catch (err) {
      logger.error('auth', 'create_organization after sign-up failed:', err);
    }
    persistSession(session);
    return { success: true, session };
  }

  // Demo mode: accounts live in this browser only
  const currentAdmins = getRegisteredAdmins();
  if (currentAdmins.some((a) => a.email.toLowerCase() === emailClean)) {
    return {
      success: false,
      error: 'Email ini sudah terdaftar sebagai Administrator. Silakan masuk menggunakan form login.',
    };
  }

  const newAdmin: AdminUser = {
    id: randomToken('admin'),
    email: emailClean,
    full_name: nameClean,
    organization_name: orgClean || nameClean,
    passwordHash: await hashPassword(emailClean, params.password),
    created_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(REGISTERED_ADMINS_KEY, JSON.stringify([...currentAdmins, newAdmin]));
  }

  const session: AdminSession = {
    user: {
      id: newAdmin.id,
      email: newAdmin.email,
      full_name: newAdmin.full_name,
      organization_name: newAdmin.organization_name,
    },
    token: randomToken('local-session'),
  };
  await createOrganization(newAdmin.organization_name || nameClean, session);
  persistSession(session);

  return { success: true, session };
}

const INVALID_LOGIN = 'Email atau kata sandi salah. Silakan coba lagi atau daftar akun admin baru.';

/**
 * Log in an Administrator
 */
export async function loginAdmin(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
  const emailClean = email.trim().toLowerCase();
  const supabase = createClient();

  if (supabase) {
    // Database mode: no local or demo fallback, otherwise any failed
    // Supabase login could still be "rescued" by a browser-side account.
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailClean,
      password,
    });
    if (error || !data.user) {
      return { success: false, error: INVALID_LOGIN };
    }

    const [{ data: profile }, { data: platformAdmin }] = await Promise.all([
      supabase.from('profiles').select('full_name, account_type').eq('id', data.user.id).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', data.user.id).maybeSingle(),
    ]);

    if (!profile || (profile.account_type !== 'organizer' && !platformAdmin)) {
      await supabase.auth.signOut();
      return { success: false, error: 'Akun ini belum terdaftar sebagai penyelenggara.' };
    }

    const session: AdminSession = {
      user: {
        id: data.user.id,
        email: data.user.email || emailClean,
        full_name: profile.full_name || data.user.email || 'Penyelenggara',
        is_platform_admin: !!platformAdmin,
      },
      token: data.session?.access_token || '',
    };
    persistSession(session);
    return { success: true, session };
  }

  // Demo mode: check the browser-local account list (includes the demo admin)
  const registeredAdmins = getRegisteredAdmins();
  const candidate = registeredAdmins.find((a) => a.email.toLowerCase() === emailClean);
  if (!candidate || !(await localPasswordMatches(candidate, password))) {
    return { success: false, error: INVALID_LOGIN };
  }

  const session: AdminSession = {
    user: {
      id: candidate.id,
      email: candidate.email,
      full_name: candidate.full_name,
      organization_name: candidate.organization_name || candidate.full_name,
      // In demo mode the built-in demo account plays the app owner
      is_platform_admin: candidate.email.toLowerCase() === DEFAULT_DEMO_ADMIN.email,
    },
    token: randomToken('local-session'),
  };
  persistSession(session);
  return { success: true, session };
}

/**
 * App owner check. Supabase mode: row in platform_admins (granted via SQL).
 * Demo mode: the built-in demo account.
 */
export function isSuperAdmin(session: AdminSession | null): boolean {
  return !!session?.user?.is_platform_admin;
}

export function getCurrentAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    // Sessions saved before platform admins existed lack the flag
    if (session.user.is_platform_admin === undefined && !createClient()) {
      session.user.is_platform_admin = session.user.email?.toLowerCase() === DEFAULT_DEMO_ADMIN.email;
    }
    return session;
  } catch {
    return null;
  }
}

export async function logoutAdmin(): Promise<void> {
  const supabase = createClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase signOut failed:', err);
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }
}

/**
 * Listens for auth state changes from Supabase and cross-tab storage events,
 * keeping the client admin session in sync. Calls onSignOut when the session ends.
 */
export function setupAuthListener(onSignOut?: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const cleanups: (() => void)[] = [];

  // 1. Cross-tab storage synchronization
  const handleStorage = (e: StorageEvent) => {
    if (e.key === ADMIN_STORAGE_KEY && !e.newValue) {
      if (onSignOut) onSignOut();
    }
  };
  window.addEventListener('storage', handleStorage);
  cleanups.push(() => window.removeEventListener('storage', handleStorage));

  // 2. Supabase auth state synchronization
  const supabase = createClient();
  if (supabase) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        localStorage.removeItem(ADMIN_STORAGE_KEY);
        if (onSignOut) onSignOut();
      }
    });
    cleanups.push(() => subscription.unsubscribe());
  }

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

