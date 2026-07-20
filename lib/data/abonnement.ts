import { StatutAbonnement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LIMITE_GRATUITE, peutAjouterAlternant } from "@/lib/abonnement";

export interface EtatAbonnement {
  nbAlternants: number;
  statut: StatutAbonnement | null;
  actif: boolean;
  limite: number;
  peutAjouter: boolean;
  stripeCustomerId: string | null;
}

/** État freemium/abonnement d'une organisation. */
export async function etatAbonnement(
  organisationId: string,
): Promise<EtatAbonnement> {
  const [nbAlternants, abonnement] = await Promise.all([
    prisma.alternant.count({ where: { organisationId } }),
    prisma.abonnement.findUnique({ where: { organisationId } }),
  ]);

  const actif = abonnement?.statut === StatutAbonnement.ACTIVE;
  return {
    nbAlternants,
    statut: abonnement?.statut ?? null,
    actif,
    limite: LIMITE_GRATUITE,
    peutAjouter: peutAjouterAlternant(nbAlternants, actif),
    stripeCustomerId: abonnement?.stripeCustomerId ?? null,
  };
}

/** Tuteurs (Users) rattachés à l'organisation. */
export function getTuteursForOrg(organisationId: string) {
  return prisma.user.findMany({
    where: { organisationId, role: "TUTEUR" },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });
}

/** Alternants de l'organisation. */
export function getAlternantsForOrg(organisationId: string) {
  return prisma.alternant.findMany({
    where: { organisationId },
    orderBy: { nom: "asc" },
    include: { diplome: { select: { nom: true } }, tuteur: { select: { nom: true } } },
  });
}
