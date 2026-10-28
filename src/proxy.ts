import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { loginRedirectPath, needsAuthCheck, supabaseEnv } from '@/lib/admin-guard';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * Edge proxy & middleware:
 * 1. IP rate limiting on public and sensitive routes (/status, /e/:path*, /admin/login)
 *    to protect against ticket enumeration, quota exhaustion spam, and credential stuffing.
 * 2. Optimistic auth check for the organizer area (Supabase mode only).
 *    Refreshes session cookies and bounces anonymous visitors before admin pages render.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request.headers);

  // 1. Rate limiting on sensitive endpoints
  let rateRule: 'status' | 'registration' | 'auth' | null = null;
  if (pathname.startsWith('/status')) {
    rateRule = 'status';
  } else if (pathname.startsWith('/e/')) {
    rateRule = 'registration';
  } else if (pathname === '/admin/login') {
    rateRule = 'auth';
  }

  if (rateRule) {
    const rate = checkRateLimit(ip, rateRule);
    if (!rate.success) {
      return new NextResponse('Terlalu banyak permintaan. Silakan coba lagi beberapa saat.', {
        status: 429,
        headers: {
          'Retry-After': String(rate.resetSeconds),
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  }

  // 2. Admin auth check
  const env = supabaseEnv();
  if (!env || !needsAuthCheck(pathname, env)) {
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
  matcher: ['/admin/:path*', '/status/:path*', '/status', '/e/:path*'],
};

