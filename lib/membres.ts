/**
 * Règles (pures) de gestion des membres d'une organisation.
 * Invariant central : une organisation doit toujours conserver au moins un
 * administrateur (sinon plus personne ne peut gérer l'entreprise).
 */

/** Vue minimale d'un membre pour les règles (découplée de Prisma). */
export interface MembreMinimal {
  id: string;
  role: string; // "TUTEUR" | "ADMIN" | …
}

/**
 * Retirer OU rétrograder le membre `cibleId` laisserait-il l'organisation sans
 * aucun administrateur ? Renvoie `false` si la cible n'est pas admin (l'opération
 * ne touche alors pas le nombre d'admins).
 */
export function laisseraitSansAdmin(
  membres: MembreMinimal[],
  cibleId: string,
): boolean {
  const cible = membres.find((m) => m.id === cibleId);
  if (!cible || cible.role !== "ADMIN") return false;
  const autresAdmins = membres.filter(
    (m) => m.id !== cibleId && m.role === "ADMIN",
  ).length;
  return autresAdmins === 0;
}
