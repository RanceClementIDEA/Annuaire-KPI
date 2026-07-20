import { prisma } from "@/lib/prisma";

/** Catalogue des référentiels avec leurs compétences et le nombre d'alternants. */
export function getReferentiels() {
  return prisma.referentiel.findMany({
    orderBy: { nom: "asc" },
    include: {
      competences: { orderBy: { intitule: "asc" } },
      _count: { select: { alternants: true } },
    },
  });
}
