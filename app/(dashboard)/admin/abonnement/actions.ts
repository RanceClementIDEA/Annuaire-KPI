"use server";

import { redirect } from "next/navigation";
import { StatutAbonnement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getStripe, paiementConfigure, siteUrl } from "@/lib/stripe";

const base = "/admin/abonnement";

function erreur(msg: string): never {
  redirect(`${base}?error=${encodeURIComponent(msg)}`);
}

/** Crée une session Stripe Checkout (abonnement métré au nb d'alternants). */
export async function creerCheckout(): Promise<void> {
  const user = await requireRole(["TUTEUR", "ADMIN"]);
  if (!user.organisationId) erreur("Aucune organisation rattachée.");
  const organisationId = user.organisationId;

  const stripe = getStripe();
  if (!stripe || !paiementConfigure()) {
    erreur("Paiement non configuré (clés Stripe manquantes).");
  }

  let url: string | null = null;
  try {
    const [org, nbAlternants] = await Promise.all([
      prisma.organisation.findUnique({ where: { id: organisationId } }),
      prisma.alternant.count({ where: { organisationId } }),
    ]);

    // Assure l'existence de l'abonnement (TRIAL) et du client Stripe.
    const abo = await prisma.abonnement.upsert({
      where: { organisationId },
      update: { nbAlternants },
      create: { organisationId, nbAlternants, statut: StatutAbonnement.TRIAL },
    });

    let customerId = abo.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org?.nom ?? undefined,
        metadata: { organisationId },
      });
      customerId = customer.id;
      await prisma.abonnement.update({
        where: { organisationId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        { price: process.env.STRIPE_PRICE_ID!, quantity: Math.max(1, nbAlternants) },
      ],
      success_url: `${siteUrl()}${base}?success=1`,
      cancel_url: `${siteUrl()}${base}?canceled=1`,
      metadata: { organisationId },
      subscription_data: { metadata: { organisationId } },
    });
    url = session.url;
  } catch {
    erreur("La création de la session de paiement a échoué.");
  }

  if (!url) erreur("Session Stripe invalide.");
  redirect(url);
}

/** Ouvre le portail de facturation Stripe (gestion / annulation). */
export async function ouvrirPortail(): Promise<void> {
  const user = await requireRole(["TUTEUR", "ADMIN"]);
  if (!user.organisationId) erreur("Aucune organisation rattachée.");

  const stripe = getStripe();
  if (!stripe) erreur("Paiement non configuré.");

  const abo = await prisma.abonnement.findUnique({
    where: { organisationId: user.organisationId },
    select: { stripeCustomerId: true },
  });
  if (!abo?.stripeCustomerId) erreur("Aucun client Stripe associé.");

  let url: string | null = null;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: abo.stripeCustomerId,
      return_url: `${siteUrl()}${base}`,
    });
    url = portal.url;
  } catch {
    erreur("Ouverture du portail impossible.");
  }
  redirect(url!);
}
