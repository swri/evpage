import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { loginRedirectPath, needsAuthCheck, supabaseEnv } from '@/lib/admin-guard';

/**
 * Optimistic auth check for the organizer area (Supabase mode only).
 * It refreshes the Supabase session cookie and redirects anonymous visitors
 * to the login page before any admin page renders. Data access itself is
 * still enforced by RLS; this only stops the admin shell from loading.
 * Demo mode keeps sessions in localStorage, which a proxy cannot read.
 */
export async function proxy(request: NextRequest) {
  const env = supabaseEnv();
  if (!env || !needsAuthCheck(request.nextUrl.pathname, env)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the token with Supabase Auth (getSession() would trust the cookie)
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(new URL(loginRedirectPath(request.nextUrl.pathname), request.url));
  }
  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
