import { prisma } from "@/lib/prisma";

/** Alternants suivis par un tuteur (isolation par tuteur). */
export function getAlternantsForTuteur(tuteurId: string) {
  return prisma.alternant.findMany({
    where: { tuteurId },
    orderBy: { nom: "asc" },
    include: { diplome: true },
  });
}

/**
 * Charge un alternant en vérifiant qu'il appartient bien au tuteur courant.
 * Renvoie null si l'alternant n'existe pas ou n'est pas suivi par ce tuteur
 * (barrière d'isolation multi-tenant).
 */
export async function getAlternantOwnedByTuteur(
  alternantId: string,
  tuteurId: string,
) {
  const alternant = await prisma.alternant.findUnique({
    where: { id: alternantId },
    include: { diplome: true },
  });
  if (!alternant || alternant.tuteurId !== tuteurId) return null;
  return alternant;
}
