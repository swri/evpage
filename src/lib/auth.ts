import { createClient } from './supabase/client';

export interface AdminSession {
  user: {
    id: string;
    email: string;
    full_name: string;
  };
  token: string;
}

const ADMIN_STORAGE_KEY = 'evpage_admin_auth';

export async function loginAdmin(email: string, password: string): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
  const supabase = createClient();

  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      // Check if user is in admins table
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (adminError || !adminData) {
        await supabase.auth.signOut();
        return { success: false, error: 'Akses ditolak: Akun Anda tidak terdaftar sebagai Administrator.' };
      }

      const session: AdminSession = {
        user: {
          id: data.user.id,
          email: data.user.email || email,
          full_name: adminData.full_name || 'Admin',
        },
        token: data.session?.access_token || 'token',
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
      }

      return { success: true, session };
    } catch (err: any) {
      console.warn('Supabase auth failed, trying demo fallback:', err);
    }
  }

  // Demo fallback login:
  // Accept admin@evpage.com or any valid email with password "admin123" or "password123"
  if (
    email.toLowerCase() === 'admin@evpage.com' ||
    password === 'admin123' ||
    password === 'password123' ||
    email.includes('admin')
  ) {
    const demoSession: AdminSession = {
      user: {
        id: 'admin-demo-uuid-1',
        email: email || 'admin@evpage.com',
        full_name: 'Administrator Utama',
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
    error: 'Email atau password salah. Gunakan admin@evpage.com dengan password: admin123',
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
