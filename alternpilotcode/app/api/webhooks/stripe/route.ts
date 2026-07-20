import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { StatutAbonnement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Traduit un statut d'abonnement Stripe vers notre enum. */
function versStatut(status: Stripe.Subscription.Status): StatutAbonnement {
  switch (status) {
    case "active":
    case "trialing":
      return StatutAbonnement.ACTIVE;
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return StatutAbonnement.CANCELLED;
    default:
      // past_due, incomplete, paused… → on conserve un accès en essai.
      return StatutAbonnement.TRIAL;
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Webhook non configuré." }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature manquante." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const organisationId = session.metadata?.organisationId;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      if (organisationId) {
        await prisma.abonnement.updateMany({
          where: { organisationId },
          data: {
            statut: StatutAbonnement.ACTIVE,
            ...(customerId ? { stripeCustomerId: customerId } : {}),
          },
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customerId = typeof sub.customer === "string" ? sub.customer : null;
      if (customerId) {
        await prisma.abonnement.updateMany({
          where: { stripeCustomerId: customerId },
          data: { statut: versStatut(sub.status) },
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
