/**
 * Règles (pures) du modèle freemium.
 * Offre gratuite : 1 alternant. Au-delà, un abonnement actif est requis
 * (facturation métrée au nombre d'alternants).
 */

export const LIMITE_GRATUITE = 1;

/** Peut-on encore ajouter un alternant ? */
export function peutAjouterAlternant(
  nbAlternants: number,
  abonnementActif: boolean,
  limite = LIMITE_GRATUITE,
): boolean {
  return abonnementActif || nbAlternants < limite;
}

/** Nombre de places gratuites restantes (0 si l'offre gratuite est saturée). */
export function placesGratuitesRestantes(
  nbAlternants: number,
  limite = LIMITE_GRATUITE,
): number {
  return Math.max(0, limite - nbAlternants);
}
