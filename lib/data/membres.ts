import { prisma } from "@/lib/prisma";

/**
 * Membres (tuteurs + admins) d'une organisation, avec le nombre d'alternants
 * suivis (utile pour bloquer le retrait d'un tuteur encore rattaché).
 */
export function getMembresForOrg(organisationId: string) {
  return prisma.user.findMany({
    where: { organisationId, role: { in: ["TUTEUR", "ADMIN"] } },
    orderBy: [{ role: "asc" }, { nom: "asc" }],
    select: {
      id: true,
      nom: true,
      email: true,
      role: true,
      _count: { select: { alternantsSuivis: true } },
    },
  });
}
