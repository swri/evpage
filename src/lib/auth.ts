import { createClient } from './supabase/client';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  organization_name?: string;
  password?: string;
  created_at: string;
}

export interface AdminSession {
  user: {
    id: string;
    email: string;
    full_name: string;
    organization_name?: string;
  };
  token: string;
}

const ADMIN_STORAGE_KEY = 'evpage_admin_auth';
const REGISTERED_ADMINS_KEY = 'evpage_registered_admins';

const DEFAULT_DEMO_ADMIN: AdminUser = {
  id: 'admin-demo-uuid-1',
  email: 'admin@evpage.com',
  password: 'admin123',
  full_name: 'Administrator Utama',
  organization_name: 'EvPage Central',
  created_at: '2026-01-01T00:00:00.000Z',
};

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

  // Check if already registered
  const currentAdmins = getRegisteredAdmins();
  if (currentAdmins.some((a) => a.email.toLowerCase() === emailClean)) {
    return {
      success: false,
      error: 'Email ini sudah terdaftar sebagai Administrator. Silakan masuk menggunakan form login.',
    };
  }

  const supabase = createClient();
  let supabaseUserId = '';

  if (supabase) {
    try {
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

      if (!error && data.user) {
        supabaseUserId = data.user.id;
        // Insert into admins table
        await supabase.from('admins').insert({
          user_id: data.user.id,
          full_name: nameClean,
          organization_name: orgClean,
          email: emailClean,
        });
      }
    } catch (err) {
      console.warn('Supabase registration fallback to local storage:', err);
    }
  }

  const newAdmin: AdminUser = {
    id: supabaseUserId || 'admin-' + Math.random().toString(36).substring(2, 9),
    email: emailClean,
    full_name: nameClean,
    organization_name: orgClean || nameClean,
    password: params.password,
    created_at: new Date().toISOString(),
  };

  const updatedAdmins = [...currentAdmins, newAdmin];
  if (typeof window !== 'undefined') {
    localStorage.setItem(REGISTERED_ADMINS_KEY, JSON.stringify(updatedAdmins));
  }

  const session: AdminSession = {
    user: {
      id: newAdmin.id,
      email: newAdmin.email,
      full_name: newAdmin.full_name,
      organization_name: newAdmin.organization_name,
    },
    token: 'bearer-token-' + Math.random().toString(36).substring(2),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
  }

  return { success: true, session };
}

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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password,
      });

      if (!error && data.user) {
        // Check if user is in admins table
        const { data: adminData } = await supabase
          .from('admins')
          .select('*')
          .eq('user_id', data.user.id)
          .single();

        const session: AdminSession = {
          user: {
            id: data.user.id,
            email: data.user.email || emailClean,
            full_name: adminData?.full_name || 'Admin',
            organization_name: adminData?.organization_name || 'Penyelenggara Event',
          },
          token: data.session?.access_token || 'token',
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
        }

        return { success: true, session };
      }
    } catch (err: unknown) {
      console.warn('Supabase auth failed, trying registered admins list:', err);
    }
  }

  // Check local registered admins list
  const registeredAdmins = getRegisteredAdmins();
  const matchedAdmin = registeredAdmins.find(
    (a) => a.email.toLowerCase() === emailClean && a.password === password
  );

  if (matchedAdmin) {
    const session: AdminSession = {
      user: {
        id: matchedAdmin.id,
        email: matchedAdmin.email,
        full_name: matchedAdmin.full_name,
        organization_name: matchedAdmin.organization_name || matchedAdmin.full_name,
      },
      token: 'session-token-' + Math.random().toString(36).substring(2),
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
    }

    return { success: true, session };
  }

  // Quick fallback for demo accounts
  if (
    (emailClean === 'admin@evpage.com' && (password === 'admin123' || password === 'password123')) ||
    (password === 'admin123' && emailClean.includes('admin'))
  ) {
    const demoSession: AdminSession = {
      user: {
        id: 'admin-demo-uuid-1',
        email: emailClean || 'admin@evpage.com',
        full_name: 'Administrator Utama',
        organization_name: 'EvPage Central',
      },
      token: 'demo-bearer-token-xyz',
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(demoSession));
    }

    return { success: true, session: demoSession };
  }

  return {
    success: false,
    error: 'Email atau kata sandi salah. Silakan coba lagi atau daftar akun admin baru.',
  };
}

export function getCurrentAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function logoutAdmin(): Promise<void> {
  const supabase = createClient();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {}
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }
}
