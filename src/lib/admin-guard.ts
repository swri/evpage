// Pure decision logic for src/proxy.ts (kept free of next/server so it is
// unit-testable under plain Node).

export const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/register'];

export function supabaseEnv(env: Record<string, string | undefined> = process.env): { url: string; key: string } | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project-id') || key.includes('your-anon-key')) return null;
  return { url, key };
}

/** Whether the proxy must ask Supabase Auth about this request at all. */
export function needsAuthCheck(pathname: string, env: ReturnType<typeof supabaseEnv>): boolean {
  return env !== null && pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.includes(pathname);
}

/** Login URL that brings the organizer back to where they were heading. */
export function loginRedirectPath(pathname: string): string {
  return `/admin/login?next=${encodeURIComponent(pathname)}`;
}

/**
 * Sanitises the ?next= value on the login page: only same-site admin paths,
 * never "//evil.com" or absolute URLs (open redirect).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('//')) return '/admin';
  return next;
}
