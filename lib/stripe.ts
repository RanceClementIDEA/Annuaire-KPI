import Stripe from "stripe";

let client: Stripe | null = null;

/** Client Stripe (null si STRIPE_SECRET_KEY n'est pas configurée). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

/** Le paiement est-il entièrement configuré (clé + prix) ? */
export function paiementConfigure(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
