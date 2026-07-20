/**
 * Utilitaires de semaine (bilan hebdomadaire). Un bilan est identifié par le
 * lundi (UTC, 00:00) de sa semaine — cohérent avec la contrainte unique
 * [alternantId, semaine] du schéma Prisma.
 */

/** Lundi (UTC, minuit) de la semaine contenant `d`. */
export function lundiDeLaSemaine(d: Date): Date {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const jour = date.getUTCDay(); // 0 = dimanche … 6 = samedi
  const delta = (jour + 6) % 7; // lundi = 0
  date.setUTCDate(date.getUTCDate() - delta);
  return date;
}

/** Libellé « semaine du JJ/MM/AAAA » à partir d'un lundi. */
export function libelleSemaine(lundi: Date): string {
  const jj = String(lundi.getUTCDate()).padStart(2, "0");
  const mm = String(lundi.getUTCMonth() + 1).padStart(2, "0");
  return `semaine du ${jj}/${mm}/${lundi.getUTCFullYear()}`;
}
