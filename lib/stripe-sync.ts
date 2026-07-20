import { StatutAbonnement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/**
 * Recale la facturation Stripe sur le nombre réel d'alternants d'une organisation.
 *
 * - Met TOUJOURS à jour le compteur `nbAlternants` en base (même sans Stripe).
 * - Si un abonnement est ACTIF et qu'on connaît la ligne facturée Stripe,
 *   ajuste la quantité (avec proratisation) pour refléter l'usage réel.
 *
 * Best-effort : n'interrompt jamais l'action métier appelante. En cas d'échec,
 * la facturation se recalera au prochain webhook `customer.subscription.updated`
 * ou à la prochaine action.
 */
export async function synchroniserQuantiteStripe(
  organisationId: string,
): Promise<void> {
  try {
    const [nbAlternants, abo] = await Promise.all([
      prisma.alternant.count({ where: { organisationId } }),
      prisma.abonnement.findUnique({ where: { organisationId } }),
    ]);

    // Compteur d'usage toujours synchronisé, indépendamment de Stripe.
    if (abo && abo.nbAlternants !== nbAlternants) {
      await prisma.abonnement.update({
        where: { organisationId },
        data: { nbAlternants },
      });
    }

    // Synchro de facturation : uniquement si abonnement actif + ligne connue.
    const stripe = getStripe();
    if (
      !stripe ||
      !abo ||
      abo.statut !== StatutAbonnement.ACTIVE ||
      !abo.stripeSubscriptionItemId
    ) {
      return;
    }

    // La quantité facturée ne descend jamais sous 1 (contrainte Stripe).
    await stripe.subscriptionItems.update(abo.stripeSubscriptionItemId, {
      quantity: Math.max(1, nbAlternants),
      proration_behavior: "create_prorations",
    });
  } catch (err) {
    console.error("[stripe-sync]", err);
  }
}
