// In-memory sliding-window rate limiter for Next.js proxy / middleware.
// Designed to prevent abuse (brute-force ticket lookup, registration flood, and credential stuffing)
// without requiring paid external services (Redis/Upstash).
//
// Limitations:
// In multi-instance serverless environments (e.g. distributed Vercel lambdas), memory
// is isolated to each runtime instance and resets on cold start. It nonetheless serves as
// an effective, zero-cost first-line defense against sustained burst and single-connection bot attacks.
// Limits are kept generous to avoid blocking legitimate users sharing NAT/office/campus IPs.

export interface RateLimitConfig {
  /** Maximum requests allowed in the time window */
  max: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export const RATE_LIMIT_RULES: Record<string, RateLimitConfig> = {
  // Checking registration status (looking up codes & phones)
  status: { max: 60, windowMs: 60 * 1000 },
  // Registration routes & forms (/e/[slug])
  registration: { max: 40, windowMs: 60 * 1000 },
  // Admin authentication attempts (/admin/login)
  auth: { max: 20, windowMs: 60 * 1000 },
};

interface RateLimitState {
  count: number;
  resetAt: number;
}

// In-memory store: Map<"rule:ip", RateLimitState>
const rateLimitStore = new Map<string, RateLimitState>();

/** Periodic cleanup to prevent memory growth */
let lastCleanup = Date.now();
function cleanupExpired(now: number) {
  if (now - lastCleanup < 60 * 1000) return;
  lastCleanup = now;
  for (const [key, state] of rateLimitStore.entries()) {
    if (state.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

/** Extracts the client IP from request headers */
export function getClientIp(headers: Headers): string {
  // 1. Cloudflare connecting IP (trustworthy behind Cloudflare proxy, cannot be spoofed by client)
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp?.trim()) return cfIp.trim();

  // 2. X-Real-IP (reverse proxy)
  const realIp = headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();

  // 3. X-Forwarded-For (client, proxy1, proxy2)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return '127.0.0.1';
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

/** Evaluates whether a request from an IP is permitted under the given rule */
export function checkRateLimit(ip: string, ruleName: keyof typeof RATE_LIMIT_RULES): RateLimitResult {
  const config = RATE_LIMIT_RULES[ruleName] || { max: 60, windowMs: 60 * 1000 };
  const now = Date.now();
  cleanupExpired(now);

  const key = `${ruleName}:${ip}`;
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      success: true,
      limit: config.max,
      remaining: config.max - 1,
      resetSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  if (existing.count >= config.max) {
    return {
      success: false,
      limit: config.max,
      remaining: 0,
      resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    success: true,
    limit: config.max,
    remaining: config.max - existing.count,
    resetSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Reset store - primarily for tests */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
