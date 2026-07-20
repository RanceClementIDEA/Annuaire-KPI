/**
 * Limiteur de débit simple, en mémoire (fenêtre fixe par clé).
 *
 * Best-effort en environnement serverless : l'état est par instance, ce qui
 * suffit à brider les clics/appels répétés d'un même utilisateur (la cause
 * n°1 de sur-facturation IA). Pour une limite distribuée stricte, brancher un
 * store partagé (Upstash Redis / Vercel KV).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetInMs: bucket.resetAt - now,
  };
}

/** Vide l'état (tests). */
export function _resetRateLimit(): void {
  buckets.clear();
}
